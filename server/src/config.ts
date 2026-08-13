import { z } from "zod";

const schema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().email(),
  KINDLE_EMAIL: z.string().email()
});

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Ошибка настроек .env:\n${parsed.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}

export type Config = ReturnType<typeof loadConfig>;
