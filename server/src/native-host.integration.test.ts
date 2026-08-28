import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { encodeNativeMessage, readNativeMessages } from "./native-protocol.js";

describe("native host process", () => {
  const directories: string[] = [];
  const makeRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "page-to-ereader-native-"));
    directories.push(root);
    return root;
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  async function runHost(serverRoot: string, message: unknown, dataRoot?: string) {
    const entry = fileURLToPath(new URL("../dist/native-host.js", import.meta.url));
    const environment = { ...process.env, PAGE_TO_EREADER_SERVER_ROOT: serverRoot };
    delete environment.PAGE_TO_EREADER_DATA_ROOT;
    if (dataRoot) environment.PAGE_TO_EREADER_DATA_ROOT = dataRoot;
    const child = spawn(process.execPath, [entry], {
      cwd: tmpdir(),
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
    child.stdin.end(encodeNativeMessage(message, 32 * 1024 * 1024));
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    expect(exitCode, Buffer.concat(stderr).toString("utf8")).toBe(0);
    const messages: unknown[] = [];
    for await (const parsed of readNativeMessages(Readable.from(stdout))) messages.push(parsed);
    return messages;
  }

  it("uses an explicit server root and keeps stdout as one clean frame", async () => {
    const serverRoot = makeRoot();
    writeFileSync(join(serverRoot, ".env"), [
      "SMTP_HOST=smtp.example.com",
      "SMTP_PORT=587",
      "SMTP_SECURE=false",
      "SMTP_USER=sender@example.com",
      "SMTP_FROM=sender@example.com",
      "KINDLE_EMAIL=reader@kindle.com"
    ].join("\n"), "utf8");
    writeFileSync(join(serverRoot, ".smtp-pass"), "lazy-dpapi-placeholder", "utf8");
    const messages = await runHost(serverRoot, { requestId: "health-test", type: "health" });
    expect(messages).toEqual([expect.objectContaining({
      requestId: "health-test",
      type: "result",
      ok: true,
      hostVersion: "0.11.1",
      protocolVersion: 2,
      capabilities: ["tabs", "pastedText", "pastedRichText", "emailSettings", "deliveryTargets"]
    })]);
    expect(existsSync(join(serverRoot, ".smtp-pass"))).toBe(true);
    expect(readFileSync(join(serverRoot, ".env"), "utf8")).not.toContain("SMTP_PASS");
  }, 20_000);

  it("keeps installed application files separate from mutable user data", async () => {
    const serverRoot = makeRoot();
    const dataRoot = makeRoot();
    writeFileSync(join(dataRoot, ".env"), [
      "SMTP_HOST=smtp.example.com",
      "SMTP_PORT=587",
      "SMTP_SECURE=false",
      "SMTP_USER=sender@example.com",
      "SMTP_FROM=sender@example.com",
      "KINDLE_EMAIL=reader@kindle.com"
    ].join("\n"), "utf8");
    writeFileSync(join(dataRoot, ".smtp-pass"), "lazy-dpapi-placeholder", "utf8");

    const health = await runHost(serverRoot, { requestId: "separate-data", type: "health" }, dataRoot);
    expect(health).toEqual([expect.objectContaining({ requestId: "separate-data", ok: true })]);
    expect(existsSync(join(dataRoot, "data", "jobs"))).toBe(true);
    expect(existsSync(join(serverRoot, "data"))).toBe(false);
  }, 20_000);

  it("reads and saves email settings even while SMTP configuration is incomplete", async () => {
    const serverRoot = makeRoot();
    const initial = await runHost(serverRoot, { requestId: "settings-initial", type: "settings-get" });
    expect(initial).toEqual([expect.objectContaining({
      requestId: "settings-initial",
      type: "result",
      ok: true,
      settings: expect.objectContaining({ senderEmail: "", destinations: [], defaultDestinationId: "kindle", passwordConfigured: false })
    })]);

    const saved = await runHost(serverRoot, {
      requestId: "settings-save",
      type: "settings-save",
      senderEmail: "sender@example.com",
      destinations: [
        { id: "kindle", kind: "kindle", email: "reader@kindle.com", senderApproved: true },
        { id: "pocketbook", kind: "pocketbook", email: "reader@pbsync.com", senderApproved: true }
      ],
      defaultDestinationId: "pocketbook"
    });
    expect(saved).toEqual([expect.objectContaining({
      requestId: "settings-save",
      type: "result",
      ok: true,
      configOk: false,
      settings: expect.objectContaining({ senderEmail: "sender@example.com", defaultDestinationId: "pocketbook" })
    })]);

    const current = await runHost(serverRoot, { requestId: "settings-current", type: "settings-get" });
    expect(current).toEqual([expect.objectContaining({
      requestId: "settings-current",
      settings: expect.objectContaining({
        senderEmail: "sender@example.com",
        destinations: expect.arrayContaining([expect.objectContaining({ kind: "pocketbook", email: "reader@pbsync.com" })])
      })
    })]);
  }, 20_000);

  it("does not decrypt a DPAPI password for health or job status", async () => {
    const serverRoot = makeRoot();
    writeFileSync(join(serverRoot, ".env"), [
      "SMTP_HOST=smtp.example.com",
      "SMTP_PORT=587",
      "SMTP_SECURE=false",
      "SMTP_USER=sender@example.com",
      "SMTP_FROM=sender@example.com",
      "KINDLE_EMAIL=reader@kindle.com"
    ].join("\n"), "utf8");
    writeFileSync(join(serverRoot, ".smtp-pass"), "not-a-valid-dpapi-value", "utf8");
    const health = await runHost(serverRoot, { requestId: "lazy-health", type: "health" });
    expect(health).toEqual([expect.objectContaining({ requestId: "lazy-health", type: "result", ok: true })]);
    const status = await runHost(serverRoot, { requestId: "lazy-status", type: "job-status", jobId: crypto.randomUUID() });
    expect(status).toEqual([expect.objectContaining({ requestId: "lazy-status", type: "result", status: "not_found" })]);
  }, 20_000);
});
