import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSmtpEnvironment, migratePlaintextSmtpPassword } from "./smtp-password.js";

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

  it("never accepts a plaintext password from the process environment", () => {
    const source = { SMTP_PASS: "plain" };
    const result = loadSmtpEnvironment(source, makeDirectory(), vi.fn() as never, "linux");
    expect(result.SMTP_PASS).toBeUndefined();
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

  it("migrates SMTP_PASS to DPAPI and removes every plaintext assignment", () => {
    const directory = makeDirectory();
    const environmentFile = join(directory, ".env");
    writeFileSync(environmentFile, "SMTP_HOST=smtp.example.com\r\nSMTP_PASS=legacy-secret\r\nSMTP_PASS=legacy-secret\r\n", "utf8");
    const runner = vi.fn((_command, _args, options: SpawnSyncOptionsWithStringEncoding) => {
      writeFileSync(options.env?.PAGE_TO_EREADER_DPAPI_TEMP as string, "encrypted", "utf8");
      return { status: 0, stdout: "", stderr: "" } as never;
    });

    expect(migratePlaintextSmtpPassword(directory, runner, "win32", { SystemRoot: "C:\\Windows" }))
      .toEqual({ migrated: true, removedPlaintext: true });
    expect(readFileSync(environmentFile, "utf8")).toBe("SMTP_HOST=smtp.example.com\r\n");
    expect(readFileSync(join(directory, ".smtp-pass"), "utf8")).toBe("encrypted");
    const options = runner.mock.lastCall?.[2] as SpawnSyncOptionsWithStringEncoding;
    expect(options.env?.PAGE_TO_EREADER_SMTP_PASS).toBe("legacy-secret");
    expect(options.env?.SMTP_PASS).toBeUndefined();
  });

  it("removes a redundant matching plaintext password without replacing DPAPI", () => {
    const directory = makeDirectory();
    writeFileSync(join(directory, ".env"), "SMTP_PASS=legacy-secret\nSMTP_HOST=smtp.example.com\n", "utf8");
    writeFileSync(join(directory, ".smtp-pass"), "encrypted", "utf8");
    const runner = vi.fn(() => ({ status: 0, stdout: "legacy-secret", stderr: "" } as never));

    expect(migratePlaintextSmtpPassword(directory, runner, "win32", { SystemRoot: "C:\\Windows" }))
      .toEqual({ migrated: false, removedPlaintext: true });
    expect(readFileSync(join(directory, ".env"), "utf8")).toBe("SMTP_HOST=smtp.example.com\n");
    expect(readFileSync(join(directory, ".smtp-pass"), "utf8")).toBe("encrypted");
  });

  it("blocks a conflicting plaintext password and preserves both files", () => {
    const directory = makeDirectory();
    const environmentFile = join(directory, ".env");
    writeFileSync(environmentFile, "SMTP_PASS=new-secret\n", "utf8");
    writeFileSync(join(directory, ".smtp-pass"), "encrypted-old", "utf8");
    const runner = vi.fn(() => ({ status: 0, stdout: "old-secret", stderr: "" } as never));

    expect(() => migratePlaintextSmtpPassword(directory, runner, "win32", { SystemRoot: "C:\\Windows" }))
      .toThrow(/не совпадает/u);
    expect(readFileSync(environmentFile, "utf8")).toBe("SMTP_PASS=new-secret\n");
    expect(readFileSync(join(directory, ".smtp-pass"), "utf8")).toBe("encrypted-old");
  });

  it("does not alter .env when DPAPI protection fails", () => {
    const directory = makeDirectory();
    const environmentFile = join(directory, ".env");
    writeFileSync(environmentFile, "SMTP_PASS=legacy-secret\n", "utf8");
    const runner = vi.fn(() => ({ status: 1, stdout: "", stderr: "failure" } as never));

    expect(() => migratePlaintextSmtpPassword(directory, runner, "win32", { SystemRoot: "C:\\Windows" }))
      .toThrow(/Не удалось защитить/u);
    expect(readFileSync(environmentFile, "utf8")).toBe("SMTP_PASS=legacy-secret\n");
    expect(existsSync(join(directory, ".smtp-pass"))).toBe(false);
  });
});
