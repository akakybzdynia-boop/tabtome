import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const [firefoxPath, profilePath, extensionPath] = process.argv.slice(2);
if (!firefoxPath || !profilePath || !extensionPath) {
  throw new Error("Usage: node test-firefox-native-load.mjs <firefox.exe> <profile> <extension-dir>");
}

const firefox = spawn(firefoxPath, [
  "--headless",
  "--no-remote",
  "--profile", profilePath,
  "--remote-debugging-port", "0",
  "--remote-allow-system-access"
], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let browserOutput = "";
const endpoint = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Firefox did not expose WebDriver BiDi.\n${browserOutput}`)), 30_000);
  const inspect = chunk => {
    browserOutput += chunk.toString("utf8");
    const match = browserOutput.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  };
  firefox.stdout.on("data", inspect);
  firefox.stderr.on("data", inspect);
  firefox.once("error", error => { clearTimeout(timer); reject(error); });
  firefox.once("exit", code => { if (code != null) { clearTimeout(timer); reject(new Error(`Firefox exited with ${code}.\n${browserOutput}`)); } });
});

let socket;
const pending = new Map();
let nextId = 1;
function command(method, params = {}, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function extensionOriginFromProfile() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const prefs = await readFile(`${profilePath}\\prefs.js`, "utf8");
      const match = prefs.match(/user_pref\("extensions\.webextensions\.uuids",\s*("(?:\\.|[^"])*")\);/);
      if (match) {
        const mapping = JSON.parse(JSON.parse(match[1]));
        const uuid = mapping["page-to-ereader-local@local"];
        if (uuid) return `moz-extension://${uuid.replace(/[{}]/g, "")}`;
      }
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Could not determine the temporary extension origin.");
}

try {
  const url = await endpoint;
  socket = new WebSocket(`${url.replace(/\/$/, "")}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    if (message.id == null || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.type === "error") item.reject(new Error(`${message.error}: ${message.message}`));
    else item.resolve(message.result);
  });

  await command("session.new", { capabilities: { alwaysMatch: {} } });
  const installed = await command("webExtension.install", { extensionData: { type: "path", path: extensionPath } });
  if (installed.extension !== "page-to-ereader-local@local") throw new Error(`Unexpected extension id: ${installed.extension}`);

  let origin;
  const realms = await command("script.getRealms", {});
  const extensionRealm = realms.realms.find(realm => realm.origin?.startsWith("moz-extension://"));
  if (extensionRealm) origin = extensionRealm.origin;
  else origin = await extensionOriginFromProfile();

  const created = await command("browsingContext.create", { type: "tab" });
  await command("browsingContext.navigate", { context: created.context, url: `${origin}/options.html`, wait: "complete" });
  const evaluated = await command("script.evaluate", {
    expression: `(async () => JSON.stringify(await browser.runtime.sendMessage({ type: "native-load-test" })))()`,
    target: { context: created.context },
    awaitPromise: true,
    resultOwnership: "none"
  }, 120_000);
  if (evaluated.type !== "success" || evaluated.result?.type !== "string") {
    throw new Error(`Firefox load test script failed: ${JSON.stringify(evaluated)}`);
  }
  const result = JSON.parse(evaluated.result.value);
  if (!result.ok || result.payloadBytes !== 20 * 1024 * 1024) throw new Error(`Firefox native load test failed: ${JSON.stringify(result)}`);
  process.stdout.write(`Firefox Native Messaging 20 MB: OK (${result.elapsedMs} ms)\n`);
  await command("webExtension.uninstall", { extension: installed.extension });
  await command("browser.close", {}).catch(() => undefined);
} finally {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Firefox test stopped.")); }
  pending.clear();
  try { socket?.close(); } catch { }
  if (firefox.exitCode == null) firefox.kill();
}
