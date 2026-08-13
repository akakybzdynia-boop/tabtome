import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSmtpEnvironment } from "./smtp-password.js";

describe("DPAPI SMTP password loader", () => {
  const directories: string[] = [];
  const makeDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), "page-to-ereader-dpapi-"));
    directories.push(directory);
    return directory;
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("leaves environment values unchanged when no protected file exists", () => {
    const source = { SMTP_PASS: "plain" };
    const result = loadSmtpEnvironment(source, makeDirectory(), vi.fn() as never, "linux");
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it("captures the decrypted password without printing it", () => {
    const directory = makeDirectory();
    writeFileSync(join(directory, ".smtp-pass"), "encrypted", "utf8");
    const runner = vi.fn(() => ({ status: 0, stdout: "decrypted-secret", stderr: "" } as never));
    const result = loadSmtpEnvironment({ SystemRoot: "C:\\Windows" }, directory, runner, "win32");
    expect(result.SMTP_PASS).toBe("decrypted-secret");
    expect(runner).toHaveBeenCalledOnce();
    const call = runner.mock.lastCall as unknown as [string, readonly string[], SpawnSyncOptionsWithStringEncoding];
    expect(call[2]).toMatchObject({ encoding: "utf8", windowsHide: true });
    expect(call[2].env?.PAGE_TO_EREADER_DPAPI_FILE).toBe(join(directory, ".smtp-pass"));
  });

  it("rejects a protected password on a non-Windows host", () => {
    const directory = makeDirectory();
    writeFileSync(join(directory, ".smtp-pass"), "encrypted", "utf8");
    expect(() => loadSmtpEnvironment({}, directory, vi.fn() as never, "linux")).toThrow(/only on Windows/);
  });
});
