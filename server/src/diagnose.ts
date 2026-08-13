import { config as loadDotenv } from "dotenv";
import { createMailer } from "./mailer.js";
import { loadConfig } from "./config.js";
import { JobStore } from "./job-store.js";
import { loadSmtpEnvironment, migratePlaintextSmtpPassword } from "./smtp-password.js";
import { SettingsStore } from "./settings-store.js";
import { ENV_FILE, JOB_DIRECTORY, SERVER_ROOT, USER_SETTINGS_FILE } from "./paths.js";

async function main() {
  const migration = migratePlaintextSmtpPassword(SERVER_ROOT);
  if (migration.migrated) process.stdout.write("SMTP password migrated from .env to Windows DPAPI.\n");
  else if (migration.removedPlaintext) process.stdout.write("Redundant SMTP_PASS removed from .env.\n");
  loadDotenv({ path: ENV_FILE });
  const environment = new SettingsStore(USER_SETTINGS_FILE).apply(loadSmtpEnvironment(process.env, SERVER_ROOT));
  const configuration = loadConfig(environment);
  new JobStore(JOB_DIRECTORY);
  process.stdout.write("Configuration and job storage: OK\nChecking SMTP connection...\n");
  await createMailer(configuration).verify();
  process.stdout.write("SMTP connection: OK\nNative host is ready.\n");
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
