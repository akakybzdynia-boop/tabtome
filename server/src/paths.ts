import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// In source and dist this module lives exactly one directory below server/.
// The environment override is used only by isolated integration tests.
export const SERVER_ROOT = process.env.PAGE_TO_EREADER_SERVER_ROOT
  ? resolve(process.env.PAGE_TO_EREADER_SERVER_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));

export const ENV_FILE = resolve(SERVER_ROOT, ".env");
export const PROTECTED_SMTP_PASSWORD_FILE = resolve(SERVER_ROOT, ".smtp-pass");
export const JOB_DIRECTORY = resolve(SERVER_ROOT, "data", "jobs");
export const LOG_DIRECTORY = resolve(SERVER_ROOT, "logs");
