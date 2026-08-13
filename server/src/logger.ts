import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LOG_DIRECTORY } from "./paths.js";

const logFile = join(LOG_DIRECTORY, "service.log");
const previousLog = join(LOG_DIRECTORY, "service.previous.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function redactLogText(value: string) {
  return value
    .replace(/\b[A-Fa-f0-9]{64}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .slice(0, 12_000);
}

function rotateIfNeeded() {
  try {
    if (statSync(logFile).size < MAX_LOG_BYTES) return;
    try { unlinkSync(previousLog); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    renameSync(logFile, previousLog);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function log(message: string, error?: unknown) {
  try {
    mkdirSync(LOG_DIRECTORY, { recursive: true });
    rotateIfNeeded();
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : error == null ? "" : String(error);
    const entry = `[${new Date().toISOString()}] ${message}${detail ? `\n${detail}` : ""}\n`;
    appendFileSync(logFile, redactLogText(entry), "utf8");
  } catch {
    // Logging must never stop the local service.
  }
}
