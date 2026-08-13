import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const executable = join(root, "host", "PageToEreaderHost.exe");
const image = readFileSync(executable);
const peOffset = image.readUInt32LE(0x3c);
const optionalHeader = peOffset + 24;
const subsystem = image.readUInt16LE(optionalHeader + 68);
if (subsystem !== 2) throw new Error(`Native launcher is not a Windows GUI executable (subsystem ${subsystem}).`);

const request = Buffer.from(JSON.stringify({ requestId: "launcher-test", type: "health" }), "utf8");
const header = Buffer.alloc(4);
header.writeUInt32LE(request.length, 0);
const child = spawn(executable, [], { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const stdout = [];
const stderr = [];
child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
child.stdin.end(Buffer.concat([header, request]));
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
if (exitCode !== 0) throw new Error(`Native launcher exited with ${exitCode}: ${Buffer.concat(stderr).toString("utf8")}`);
const output = Buffer.concat(stdout);
if (output.length < 4) throw new Error("Native launcher returned no protocol frame.");
const length = output.readUInt32LE(0);
if (output.length !== length + 4) throw new Error("Native launcher polluted or truncated protocol stdout.");
const response = JSON.parse(output.subarray(4).toString("utf8"));
if (response.requestId !== "launcher-test" || response.hostVersion !== "0.9.0" || response.protocolVersion !== 1 || !response.capabilities?.includes("pastedRichText") || !response.capabilities?.includes("emailSettings")) {
  throw new Error(`Unexpected native launcher response: ${JSON.stringify(response)}`);
}
process.stdout.write("Windowless native launcher and protocol forwarding: OK\n");
