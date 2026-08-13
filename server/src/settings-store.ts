import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const savedSettingsSchema = z.object({
  senderEmail: z.string().trim().email(),
  kindleEmail: z.string().trim().email(),
  amazonSenderApproved: z.boolean()
}).strict();

export type UserSettings = z.infer<typeof savedSettingsSchema>;

export class SettingsStore {
  constructor(private readonly file: string) {}

  read(): UserSettings | undefined {
    try {
      return savedSettingsSchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(`Не удалось прочитать локальные настройки: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  resolve(environment: NodeJS.ProcessEnv): UserSettings {
    const saved = this.read();
    if (saved) return saved;
    return {
      senderEmail: environment.SMTP_FROM || environment.SMTP_USER || "",
      kindleEmail: environment.KINDLE_EMAIL || "",
      amazonSenderApproved: false
    };
  }

  apply(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const settings = this.read();
    if (!settings) return { ...environment };
    return {
      ...environment,
      SMTP_USER: settings.senderEmail,
      SMTP_FROM: settings.senderEmail,
      KINDLE_EMAIL: settings.kindleEmail
    };
  }

  save(input: unknown): UserSettings {
    const settings = savedSettingsSchema.parse(input);
    const directory = dirname(this.file);
    mkdirSync(directory, { recursive: true });
    const temporaryFile = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryFile, this.file);
    } finally {
      rmSync(temporaryFile, { force: true });
    }
    return settings;
  }
}
