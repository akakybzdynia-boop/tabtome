import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "extension", "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const popup = readFileSync(join(dist, "popup.html"), "utf8");
const popupScript = readFileSync(join(dist, "popup.js"), "utf8");
const backgroundScript = readFileSync(join(dist, "background.js"), "utf8");

if (manifest.version !== "0.8.0") throw new Error(`Unexpected extension version: ${manifest.version}`);
if (!manifest.permissions?.includes("nativeMessaging")) throw new Error("nativeMessaging permission is missing.");
if (manifest.permissions?.includes("clipboardRead")) throw new Error("Pasted-text mode must not request clipboardRead.");
if (!popup.includes('id="mode-text"') || !popup.includes('id="pasted-content"') || !popup.includes('contenteditable="true"')) {
  throw new Error("Rich pasted-text controls are missing from the built popup.");
}
if (!manifest.action?.default_icon?.["16"] || !manifest.icons?.["96"]) throw new Error("Extension icons are missing from the manifest.");
for (const size of [16, 32, 48, 64, 96]) {
  if (!existsSync(join(dist, "icons", `icon-${size}.png`))) throw new Error(`Generated ${size}px icon is missing.`);
}
if (!popupScript.includes("clipboardData") || popupScript.includes("navigator.clipboard")) {
  throw new Error("Rich paste must use the user-initiated paste event and must not read the clipboard programmatically.");
}
if (!backgroundScript.includes('sourcePolicy === "paste" ? "omit" : "include"')) {
  throw new Error("Remote pasted images must be fetched without credentials.");
}
if (!backgroundScript.includes("isPublicImageUrl") || !backgroundScript.includes("skippedImages")) {
  throw new Error("Remote image network filtering or visible skipped-image handling is missing.");
}

process.stdout.write("Extension rich-paste and icon contract: OK\n");
