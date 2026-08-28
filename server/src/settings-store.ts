import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const kindleDestinationSchema = z.object({
  id: z.literal("kindle"),
  kind: z.literal("kindle"),
  email: z.string().trim().email(),
  senderApproved: z.boolean()
}).strict();

const pocketBookDestinationSchema = z.object({
  id: z.literal("pocketbook"),
  kind: z.literal("pocketbook"),
  email: z.string().trim().email().refine(
    value => value.toLowerCase().endsWith("@pbsync.com"),
    "Адрес Send-to-PocketBook должен оканчиваться на @pbsync.com"
  ),
  senderApproved: z.boolean()
}).strict();

export const deliveryDestinationSchema = z.discriminatedUnion("kind", [
  kindleDestinationSchema,
  pocketBookDestinationSchema
]);

export const savedSettingsSchema = z.object({
  senderEmail: z.string().trim().email(),
  destinations: z.array(deliveryDestinationSchema).min(1).max(2),
  defaultDestinationId: z.enum(["kindle", "pocketbook"])
}).strict().superRefine((value, context) => {
  const ids = value.destinations.map(destination => destination.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinations"], message: "Получатели не должны повторяться" });
  }
  if (!ids.includes(value.defaultDestinationId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultDestinationId"], message: "Получатель по умолчанию не настроен" });
  }
});

const legacySettingsSchema = z.object({
  senderEmail: z.string().trim().email(),
  kindleEmail: z.string().trim().email(),
  amazonSenderApproved: z.boolean()
}).strict();

export type DeliveryDestination = z.infer<typeof deliveryDestinationSchema>;
export type UserSettings = z.infer<typeof savedSettingsSchema>;

export class SettingsStore {
  constructor(private readonly file: string) {}

  read(): UserSettings | undefined {
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8"));
      const current = savedSettingsSchema.safeParse(raw);
      if (current.success) return current.data;
      const legacy = legacySettingsSchema.safeParse(raw);
      if (!legacy.success) throw current.error;
      const migrated: UserSettings = {
        senderEmail: legacy.data.senderEmail,
        destinations: [{
          id: "kindle",
          kind: "kindle",
          email: legacy.data.kindleEmail,
          senderApproved: legacy.data.amazonSenderApproved
        }],
        defaultDestinationId: "kindle"
      };
      this.write(migrated);
      return migrated;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(`Не удалось прочитать локальные настройки: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  resolve(environment: NodeJS.ProcessEnv): UserSettings {
    const saved = this.read();
    if (saved) return saved;
    const kindleEmail = environment.KINDLE_EMAIL?.trim() || "";
    const destinations: DeliveryDestination[] = kindleEmail
      ? [{ id: "kindle", kind: "kindle", email: kindleEmail, senderApproved: false }]
      : [];
    return {
      senderEmail: environment.SMTP_FROM || environment.SMTP_USER || "",
      destinations,
      defaultDestinationId: "kindle"
    };
  }

  apply(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const settings = this.read();
    if (!settings) return { ...environment };
    const kindle = settings.destinations.find(destination => destination.kind === "kindle");
    return {
      ...environment,
      SMTP_USER: settings.senderEmail,
      SMTP_FROM: settings.senderEmail,
      ...(kindle ? { KINDLE_EMAIL: kindle.email } : {})
    };
  }

  destination(environment: NodeJS.ProcessEnv, id: string): DeliveryDestination {
    const destination = this.resolve(environment).destinations.find(candidate => candidate.id === id);
    if (!destination) throw new Error("Выбранный получатель не настроен.");
    if (!destination.senderApproved) {
      throw new Error(destination.kind === "kindle"
        ? "Подтвердите, что адрес отправителя разрешён в Amazon."
        : "Подтвердите, что адрес отправителя добавлен в белый список Send-to-PocketBook.");
    }
    return destination;
  }

  save(input: unknown): UserSettings {
    const settings = savedSettingsSchema.parse(input);
    this.write(settings);
    return settings;
  }

  private write(settings: UserSettings) {
    const directory = dirname(this.file);
    mkdirSync(directory, { recursive: true });
    const temporaryFile = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryFile, this.file);
    } finally {
      rmSync(temporaryFile, { force: true });
    }
  }
}
