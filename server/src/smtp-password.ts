import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { SERVER_ROOT } from "./paths.js";

type Runner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding
) => SpawnSyncReturns<string>;

export function loadSmtpEnvironment(
  source: NodeJS.ProcessEnv,
  serverDirectory = SERVER_ROOT,
  runner: Runner = spawnSync,
  platform: NodeJS.Platform = process.platform
) {
  const env = { ...source };
  const encryptedFile = join(serverDirectory, ".smtp-pass");
  if (!existsSync(encryptedFile)) return env;
  if (platform !== "win32") throw new Error("DPAPI SMTP password is supported only on Windows.");

  const powershell = join(source.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "$ErrorActionPreference='Stop'",
    "$encrypted=Get-Content -LiteralPath $env:PAGE_TO_EREADER_DPAPI_FILE -Raw",
    "$secure=ConvertTo-SecureString $encrypted",
    "$credential=New-Object System.Management.Automation.PSCredential('smtp',$secure)",
    "[Console]::Out.Write($credential.GetNetworkCredential().Password)"
  ].join(";");
  const result = runner(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-Command", script
  ], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024,
    env: { ...source, PAGE_TO_EREADER_DPAPI_FILE: encryptedFile }
  });
  if (result.status !== 0 || !result.stdout) throw new Error("Не удалось расшифровать SMTP-пароль текущего пользователя Windows.");
  env.SMTP_PASS = result.stdout;
  return env;
}
