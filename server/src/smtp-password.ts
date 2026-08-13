import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { parse as parseDotenv } from "dotenv";
import { SERVER_ROOT } from "./paths.js";

type Runner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding
) => SpawnSyncReturns<string>;

const smtpPassAssignment = /^\s*(?:export\s+)?SMTP_PASS\s*=/u;

function powershellPath(environment: NodeJS.ProcessEnv) {
  return join(environment.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function withoutPlaintextPassword(environment: NodeJS.ProcessEnv) {
  const sanitized = { ...environment };
  delete sanitized.SMTP_PASS;
  return sanitized;
}

function removeSmtpPassLines(contents: string) {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const hadFinalNewline = /(?:\r\n|\n)$/u.test(contents);
  const lines = contents.split(/\r?\n/u).filter(line => !smtpPassAssignment.test(line));
  if (hadFinalNewline && lines.at(-1) === "") lines.pop();
  const result = lines.join(newline);
  return hadFinalNewline && result ? `${result}${newline}` : result;
}

function protectPassword(
  password: string,
  encryptedFile: string,
  environment: NodeJS.ProcessEnv,
  runner: Runner
) {
  const temporaryFile = `${encryptedFile}.${randomUUID()}.tmp`;
  const script = [
    "$ErrorActionPreference='Stop'",
    "$plain=$env:PAGE_TO_EREADER_SMTP_PASS",
    "$secure=ConvertTo-SecureString $plain -AsPlainText -Force",
    "$encrypted=ConvertFrom-SecureString $secure",
    "$roundtrip=ConvertTo-SecureString $encrypted",
    "$credential=New-Object System.Management.Automation.PSCredential('smtp',$roundtrip)",
    "if($credential.GetNetworkCredential().Password -cne $plain){throw 'DPAPI round-trip failed'}",
    "$utf8=New-Object System.Text.UTF8Encoding($false)",
    "[System.IO.File]::WriteAllText($env:PAGE_TO_EREADER_DPAPI_TEMP,$encrypted,$utf8)"
  ].join(";");
  const result = runner(powershellPath(environment), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-Command", script
  ], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024,
    env: {
      ...withoutPlaintextPassword(environment),
      PAGE_TO_EREADER_SMTP_PASS: password,
      PAGE_TO_EREADER_DPAPI_TEMP: temporaryFile
    }
  });
  if (result.status !== 0 || !existsSync(temporaryFile)) {
    rmSync(temporaryFile, { force: true });
    throw new Error("Не удалось защитить SMTP-пароль через Windows DPAPI. Открытый пароль оставлен без изменений.");
  }
  try {
    renameSync(temporaryFile, encryptedFile);
  } finally {
    rmSync(temporaryFile, { force: true });
  }
}

export function migratePlaintextSmtpPassword(
  serverDirectory = SERVER_ROOT,
  runner: Runner = spawnSync,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
) {
  const environmentFile = join(serverDirectory, ".env");
  const encryptedFile = join(serverDirectory, ".smtp-pass");
  if (!existsSync(environmentFile)) return { migrated: false, removedPlaintext: false };

  const contents = readFileSync(environmentFile, "utf8");
  const hasAssignment = contents.split(/\r?\n/u).some(line => smtpPassAssignment.test(line));
  if (!hasAssignment) return { migrated: false, removedPlaintext: false };
  if (platform !== "win32") throw new Error("Открытый SMTP_PASS в .env запрещён; автоматическая миграция DPAPI работает только в Windows.");

  const password = parseDotenv(contents).SMTP_PASS || "";
  let migrated = false;
  if (password) {
    if (existsSync(encryptedFile)) {
      const decrypted = loadSmtpEnvironment(withoutPlaintextPassword(environment), serverDirectory, runner, platform).SMTP_PASS;
      if (decrypted !== password) {
        throw new Error("SMTP_PASS в .env не совпадает с DPAPI-паролем. Открытый пароль не используется; запустите protect-smtp-password.ps1 заново.");
      }
    } else {
      protectPassword(password, encryptedFile, environment, runner);
      migrated = true;
    }
  }

  const sanitizedContents = removeSmtpPassLines(contents);
  const temporaryEnvironmentFile = `${environmentFile}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryEnvironmentFile, sanitizedContents, {
      encoding: "utf8",
      mode: statSync(environmentFile).mode
    });
    if (parseDotenv(readFileSync(temporaryEnvironmentFile, "utf8")).SMTP_PASS !== undefined) {
      throw new Error("Не удалось удалить SMTP_PASS из временной копии .env.");
    }
    renameSync(temporaryEnvironmentFile, environmentFile);
  } finally {
    rmSync(temporaryEnvironmentFile, { force: true });
  }
  return { migrated, removedPlaintext: true };
}

export function loadSmtpEnvironment(
  source: NodeJS.ProcessEnv,
  serverDirectory = SERVER_ROOT,
  runner: Runner = spawnSync,
  platform: NodeJS.Platform = process.platform
) {
  const env = withoutPlaintextPassword(source);
  const encryptedFile = join(serverDirectory, ".smtp-pass");
  if (!existsSync(encryptedFile)) return env;
  if (platform !== "win32") throw new Error("DPAPI SMTP password is supported only on Windows.");

  const script = [
    "$ErrorActionPreference='Stop'",
    "$encrypted=Get-Content -LiteralPath $env:PAGE_TO_EREADER_DPAPI_FILE -Raw",
    "$secure=ConvertTo-SecureString $encrypted",
    "$credential=New-Object System.Management.Automation.PSCredential('smtp',$secure)",
    "[Console]::Out.Write($credential.GetNetworkCredential().Password)"
  ].join(";");
  const result = runner(powershellPath(source), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-Command", script
  ], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024,
    env: { ...withoutPlaintextPassword(source), PAGE_TO_EREADER_DPAPI_FILE: encryptedFile }
  });
  if (result.status !== 0 || !result.stdout) throw new Error("Не удалось расшифровать SMTP-пароль текущего пользователя Windows.");
  env.SMTP_PASS = result.stdout;
  return env;
}
