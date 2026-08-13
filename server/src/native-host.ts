import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";
import { createMailer } from "./mailer.js";
import { JobStore } from "./job-store.js";
import { log } from "./logger.js";
import { readNativeMessages, writeNativeMessage } from "./native-protocol.js";
import { errorCode, SendService } from "./send-service.js";
import { loadConfig } from "./config.js";
import { loadSmtpEnvironment } from "./smtp-password.js";
import { ENV_FILE, JOB_DIRECTORY, PROTECTED_SMTP_PASSWORD_FILE, SERVER_ROOT } from "./paths.js";

const HOST_VERSION = "0.8.0";
const PROTOCOL_VERSION = 1;
const CAPABILITIES = ["tabs", "pastedText", "pastedRichText"] as const;
const envelope = z.object({
  requestId: z.string().min(1).max(100),
  type: z.enum(["health", "smtp-check", "job-status", "send"])
}).passthrough();
const jobCommand = z.object({ jobId: z.string().uuid() });

loadDotenv({ path: ENV_FILE });
const jobs = new JobStore(JOB_DIRECTORY);
const baseEnvironment = { ...process.env };
let service: SendService | undefined;
let startupError: Error | undefined;
try {
  const probeEnvironment = { ...baseEnvironment };
  if (!probeEnvironment.SMTP_PASS && existsSync(PROTECTED_SMTP_PASSWORD_FILE)) {
    probeEnvironment.SMTP_PASS = "dpapi-protected";
  }
  loadConfig(probeEnvironment);
} catch (error) {
  startupError = error instanceof Error ? error : new Error(String(error));
  log("Native host configuration failed", startupError);
}

function getService() {
  if (startupError) throw startupError;
  if (!service) {
    const environment = loadSmtpEnvironment(baseEnvironment, SERVER_ROOT);
    service = new SendService(createMailer(loadConfig(environment)), jobs);
  }
  return service;
}

function response(requestId: string, payload: Record<string, unknown>) {
  return writeNativeMessage(process.stdout, { requestId, ...payload });
}

async function handle(raw: unknown) {
  const command = envelope.parse(raw);
  const { requestId } = command;
  if (command.type === "health") {
    return response(requestId, {
      type: "result",
      ok: !startupError,
      configOk: !startupError,
      hostVersion: HOST_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: CAPABILITIES,
      error: startupError?.message
    });
  }
  if (command.type === "job-status") {
    const { jobId } = jobCommand.parse(command);
    const entry = jobs.get(jobId);
    return response(requestId, { type: "result", ok: true, jobId, status: entry?.status || "not_found", entry });
  }
  if (command.type === "smtp-check") {
    return response(requestId, { type: "result", ...(await getService().smtpCheck()) });
  }
  const result = await getService().send(command, update => response(requestId, { type: "progress", ...update }));
  return response(requestId, { type: "result", ...result });
}

async function main() {
  for await (const message of readNativeMessages(process.stdin)) {
    const requestId = typeof message === "object" && message && "requestId" in message
      ? String((message as { requestId: unknown }).requestId).slice(0, 100)
      : "unknown";
    try { await handle(message); }
    catch (error) {
      log("Native request failed", error);
      try {
        await response(requestId, {
          type: "error",
          ok: false,
          code: errorCode(error),
          error: error instanceof Error ? error.message : "Неизвестная ошибка"
        });
      } catch (writeError) {
        log("Could not write native error response", writeError);
        return;
      }
    }
  }
}

process.on("uncaughtException", error => { log("Native host uncaught exception", error); process.exitCode = 1; });
process.on("unhandledRejection", reason => { log("Native host unhandled rejection", reason); process.exitCode = 1; });
main().catch(error => { log("Native host stopped", error); process.exitCode = 1; });
