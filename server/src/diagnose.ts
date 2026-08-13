import { config as loadDotenv } from "dotenv";
import { createMailer } from "./mailer.js";
import { loadConfig } from "./config.js";
import { JobStore } from "./job-store.js";
import { loadSmtpEnvironment } from "./smtp-password.js";
import { ENV_FILE, JOB_DIRECTORY, SERVER_ROOT } from "./paths.js";

async function main() {
  loadDotenv({ path: ENV_FILE });
  const environment = loadSmtpEnvironment(process.env, SERVER_ROOT);
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
