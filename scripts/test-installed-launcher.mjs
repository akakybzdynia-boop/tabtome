import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const [executableArgument, expectedDataRootArgument] = process.argv.slice(2);
if (!executableArgument || !expectedDataRootArgument) {
  throw new Error("Usage: node test-installed-launcher.mjs <host.exe> <data-root>");
}

const executable = resolve(executableArgument);
const expectedDataRoot = resolve(expectedDataRootArgument);
const image = readFileSync(executable);
const peOffset = image.readUInt32LE(0x3c);
const optionalHeader = peOffset + 24;
if (image.readUInt16LE(optionalHeader + 68) !== 2) throw new Error("Installed launcher is not a Windows GUI executable.");

const request = Buffer.from(JSON.stringify({ requestId: "installed-launcher-test", type: "health" }), "utf8");
const header = Buffer.alloc(4);
header.writeUInt32LE(request.length, 0);
const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const stdout = [];
const stderr = [];
child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
child.stdin.end(Buffer.concat([header, request]));
const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("close", resolveExit);
});
if (exitCode !== 0) throw new Error(`Installed launcher exited with ${exitCode}: ${Buffer.concat(stderr).toString("utf8")}`);
const output = Buffer.concat(stdout);
if (output.length < 4) throw new Error("Installed launcher returned no protocol frame.");
const length = output.readUInt32LE(0);
if (output.length !== length + 4) throw new Error("Installed launcher polluted or truncated protocol stdout.");
const response = JSON.parse(output.subarray(4).toString("utf8"));
if (response.requestId !== "installed-launcher-test" || response.hostVersion !== "0.11.1" || response.protocolVersion !== 2 || !response.ok) {
  throw new Error(`Unexpected installed native host response: ${JSON.stringify(response)}`);
}

process.stdout.write(`Installed native launcher: OK\nUser data root: ${expectedDataRoot}\n`);
