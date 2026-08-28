import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// In source and dist this module lives exactly one directory below server/.
// The environment override is used only by isolated integration tests.
export const SERVER_ROOT = process.env.PAGE_TO_EREADER_SERVER_ROOT
  ? resolve(process.env.PAGE_TO_EREADER_SERVER_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));

// Installed releases keep mutable data outside the application directory so
// updates can replace the bundled runtime without touching credentials,
// settings, job history or logs. Development and legacy layouts continue to
// use server/ when no explicit data root is supplied by the launcher.
export const DATA_ROOT = process.env.PAGE_TO_EREADER_DATA_ROOT
  ? resolve(process.env.PAGE_TO_EREADER_DATA_ROOT)
  : SERVER_ROOT;

export const ENV_FILE = resolve(DATA_ROOT, ".env");
export const PROTECTED_SMTP_PASSWORD_FILE = resolve(DATA_ROOT, ".smtp-pass");
export const USER_SETTINGS_FILE = resolve(DATA_ROOT, "data", "settings.json");
export const JOB_DIRECTORY = resolve(DATA_ROOT, "data", "jobs");
export const LOG_DIRECTORY = resolve(DATA_ROOT, "logs");
