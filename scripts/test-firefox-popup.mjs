import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const [firefoxPath, extensionPath, outputPath] = process.argv.slice(2);
if (!firefoxPath || !extensionPath || !outputPath) {
  throw new Error("Usage: node test-firefox-popup.mjs <firefox.exe> <extension-dir> <output-dir>");
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "page-to-ereader-popup-"));
const profilePath = join(temporaryRoot, "profile");
await mkdir(profilePath);
await mkdir(outputPath, { recursive: true });

const titles = [
  "Блины — рассказ Н. Тэффи",
  "Усолье-Камское: история города",
  "Flying like a Bird",
  "Яблоку негде упасть — длинное название страницы",
  "Ключ к тексту: заметки о чтении"
];
let trackingRequests = 0;
const server = createServer((request, response) => {
  if (request.url?.startsWith("/tracking.png")) trackingRequests++;
  const index = Number(new URL(request.url || "/", "http://localhost").pathname.slice(1)) || 0;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><title>${titles[index] || titles[0]}</title><p>Test page</p>`);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start local test server.");

const remotePort = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const probeAddress = probe.address();
    if (!probeAddress || typeof probeAddress === "string") return reject(new Error("Could not reserve a Firefox remote port."));
    const port = probeAddress.port;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});

const firefox = spawn(firefoxPath, [
  "--headless", "--no-remote", "--profile", profilePath,
  "--remote-debugging-port", String(remotePort), "--remote-allow-system-access"
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
      const prefs = await readFile(join(profilePath, "prefs.js"), "utf8");
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

async function connectWebSocket(url) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = new WebSocket(url);
    try {
      await new Promise((resolve, reject) => {
        candidate.addEventListener("open", resolve, { once: true });
        candidate.addEventListener("error", event => reject(event.error || new Error(event.message || "WebSocket connection failed")), { once: true });
      });
      return candidate;
    } catch (error) {
      lastError = error;
      try { candidate.close(); } catch { }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Could not connect to Firefox WebDriver BiDi: ${String(lastError)}\n${browserOutput}`);
}

async function evaluate(context, expression) {
  const result = await command("script.evaluate", {
    expression: `JSON.stringify((() => { ${expression} })())`,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none"
  });
  if (result.type !== "success" || result.result?.type !== "string") throw new Error(`Evaluation failed: ${JSON.stringify(result)}`);
  return JSON.parse(result.result.value);
}

try {
  const url = await endpoint;
  socket = await connectWebSocket(`${url.replace(/\/$/, "")}/session`);
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
  for (let index = 0; index < titles.length; index++) {
    const page = await command("browsingContext.create", { type: "tab" });
    await command("browsingContext.navigate", { context: page.context, url: `http://127.0.0.1:${address.port}/${index}`, wait: "complete" });
  }

  const origin = await extensionOriginFromProfile();
  const popup = await command("browsingContext.create", { type: "tab" });
  await command("browsingContext.setViewport", { context: popup.context, viewport: { width: 412, height: 640 }, devicePixelRatio: 1 });
  await command("browsingContext.navigate", { context: popup.context, url: `${origin}/popup.html`, wait: "complete" });
  let alignment;
  for (let attempt = 0; attempt < 100; attempt++) {
    alignment = await evaluate(popup.context, `
      const rows = [...document.querySelectorAll('.tab')];
      const checks = rows.map(row => row.querySelector('input').getBoundingClientRect().left);
      const titles = rows.map(row => row.querySelector('span').getBoundingClientRect().left);
      return { count: rows.length, checkSpread: rows.length ? Math.max(...checks) - Math.min(...checks) : 0, titleSpread: rows.length ? Math.max(...titles) - Math.min(...titles) : 0 };
    `);
    if (alignment.count >= titles.length) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (alignment.count < titles.length || alignment.checkSpread > 0.5 || alignment.titleSpread > 0.5) {
    throw new Error(`Tab rows are not left-aligned: ${JSON.stringify(alignment)}`);
  }
  const tabsShot = await command("browsingContext.captureScreenshot", { context: popup.context, origin: "viewport" });
  await writeFile(join(outputPath, "popup-tabs.png"), Buffer.from(tabsShot.data, "base64"));

  const keyboardTabs = await evaluate(popup.context, `
    const tabsButton = document.querySelector('#mode-tabs');
    tabsButton.focus();
    tabsButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    return {
      active: document.activeElement?.id,
      tabsIndex: tabsButton.tabIndex,
      textIndex: document.querySelector('#mode-text').tabIndex,
      textSelected: document.querySelector('#mode-text').getAttribute('aria-selected')
    };
  `);
  if (keyboardTabs.active !== "mode-text" || keyboardTabs.tabsIndex !== -1 || keyboardTabs.textIndex !== 0 || keyboardTabs.textSelected !== "true") {
    throw new Error(`Tablist keyboard behavior is incomplete: ${JSON.stringify(keyboardTabs)}`);
  }

  const pasteResult = await evaluate(popup.context, `
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<h2 onclick="bad()">Заголовок</h2><p><strong>Жирный текст</strong> и <em>курсив</em>.</p><script>bad()</script><img alt="Точка" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="><img alt="Сетевое" src="http://127.0.0.1:${address.port}/tracking.png">');
    const editor = document.querySelector('#pasted-content');
    editor.focus();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: transfer });
    editor.dispatchEvent(paste);
    return {
      html: editor.innerHTML,
      textCount: document.querySelector('#text-count').textContent,
      imageCount: document.querySelector('#pasted-image-count').textContent,
      remoteHasSrc: [...editor.querySelectorAll('img')].some(image => image.alt === 'Сетевое' && image.hasAttribute('src')),
      remoteAlt: [...editor.querySelectorAll('img')].find(image => image.dataset.kindleRemote === 'true')?.alt
    };
  `);
  await new Promise(resolve => setTimeout(resolve, 200));
  const postPaste = await evaluate(popup.context, `return { scrollY: window.scrollY, visualTop: window.visualViewport?.offsetTop || 0, headingTop: document.querySelector('.heading').getBoundingClientRect().top };`);
  if (!pasteResult.html.includes("<strong>") || !pasteResult.html.includes("data-kindle-image-id") || pasteResult.html.includes("script") || pasteResult.html.includes("onclick") || pasteResult.imageCount !== "2" || pasteResult.remoteHasSrc || pasteResult.remoteAlt !== "Сетевое" || trackingRequests !== 0 || postPaste.scrollY !== 0 || postPaste.visualTop !== 0 || postPaste.headingTop < 0) {
    throw new Error(`Rich paste was not sanitized correctly: ${JSON.stringify(pasteResult)}`);
  }
  const textShot = await command("browsingContext.captureScreenshot", { context: popup.context, origin: "viewport" });
  await writeFile(join(outputPath, "popup-rich-text.png"), Buffer.from(textShot.data, "base64"));

  await command("webExtension.uninstall", { extension: installed.extension });
  await command("browser.close", {}).catch(() => undefined);
  process.stdout.write(`Firefox popup UI: OK (${alignment.count} aligned rows, rich paste sanitized)\n`);
} finally {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Firefox popup test stopped.")); }
  pending.clear();
  try { socket?.close(); } catch { }
  if (firefox.exitCode == null) {
    firefox.kill();
    await Promise.race([
      new Promise(resolve => firefox.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 3_000))
    ]);
  }
  await new Promise(resolve => server.close(resolve));
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
