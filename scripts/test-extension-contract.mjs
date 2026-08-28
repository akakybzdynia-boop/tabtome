import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const firefoxDist = join(root, "extension", "dist");
const chromeDist = join(root, "extension", "dist-chrome");
const firefoxManifest = JSON.parse(readFileSync(join(firefoxDist, "manifest.json"), "utf8"));
const chromeManifest = JSON.parse(readFileSync(join(chromeDist, "manifest.json"), "utf8"));
const popup = readFileSync(join(firefoxDist, "popup.html"), "utf8");
const popupScript = readFileSync(join(firefoxDist, "popup.js"), "utf8");
const backgroundScript = readFileSync(join(firefoxDist, "background.js"), "utf8");
const chromeBackgroundScript = readFileSync(join(chromeDist, "background.js"), "utf8");
const backgroundSource = readFileSync(join(root, "extension", "src", "background.ts"), "utf8");
const popupSource = readFileSync(join(root, "extension", "src", "popup.ts"), "utf8");
const optionsSource = readFileSync(join(root, "extension", "src", "options.ts"), "utf8");
const contentSource = readFileSync(join(root, "extension", "src", "content.ts"), "utf8");
const optionsHtml = readFileSync(join(root, "extension", "src", "options.html"), "utf8");
const iconSource = readFileSync(join(root, "extension", "icons", "icon.svg"), "utf8");
const localeMessages = Object.fromEntries(["en", "ru"].map(locale => [
  locale,
  JSON.parse(readFileSync(join(root, "extension", "_locales", locale, "messages.json"), "utf8"))
]));

for (const [browserName, manifest] of [["Firefox", firefoxManifest], ["Chrome", chromeManifest]]) {
  if (manifest.version !== "0.11.1") throw new Error(`Unexpected ${browserName} extension version: ${manifest.version}`);
  if (!manifest.permissions?.includes("nativeMessaging")) throw new Error(`${browserName}: nativeMessaging permission is missing.`);
  if (!manifest.permissions?.includes("contextMenus")) throw new Error(`${browserName}: contextMenus permission is missing.`);
  if (manifest.permissions?.includes("clipboardRead")) throw new Error(`${browserName}: pasted-text mode must not request clipboardRead.`);
  if (!manifest.action?.default_icon?.["16"] || !manifest.icons?.["128"]) throw new Error(`${browserName}: extension icons are missing from the manifest.`);
  if (manifest.default_locale !== "en" || manifest.name !== "__MSG_extension_name__" || manifest.action?.default_title !== "__MSG_action_title__") {
    throw new Error(`${browserName}: localized manifest fields are missing.`);
  }
  if (manifest.incognito !== "not_allowed") throw new Error(`${browserName}: private browsing must be disabled.`);
}
if (firefoxManifest.background?.scripts?.[0] !== "background.js" || firefoxManifest.background?.service_worker) {
  throw new Error("Firefox must use a Manifest V3 background script.");
}
const requiredData = firefoxManifest.browser_specific_settings?.gecko?.data_collection_permissions?.required || [];
for (const category of ["browsingActivity", "websiteContent", "personallyIdentifyingInfo"]) {
  if (!requiredData.includes(category)) throw new Error(`Firefox data_collection_permissions is missing ${category}.`);
}
if (requiredData.includes("authenticationInfo")) throw new Error("Firefox must not declare authenticationInfo: the extension never receives the SMTP password.");
if (chromeManifest.background?.service_worker !== "background.js" || chromeManifest.background?.scripts || chromeManifest.background?.persistent !== undefined) {
  throw new Error("Chrome must use a Manifest V3 extension service worker.");
}
if (chromeManifest.browser_specific_settings || chromeManifest.minimum_chrome_version !== "127") {
  throw new Error("Chrome manifest contains Firefox-only settings or an unexpected minimum version.");
}
if (!chromeBackgroundScript.startsWith("const browser = globalThis.browser ?? globalThis.chrome;")) {
  throw new Error("Chrome WebExtensions API compatibility alias is missing.");
}
if (!chromeBackgroundScript.includes("globalThis.chrome") || !chromeBackgroundScript.includes("lastError") || !backgroundSource.includes("Port.error")) {
  throw new Error("Cross-browser Native Messaging disconnect handling is missing.");
}
if (!popup.includes('id="mode-text"') || !popup.includes('id="pasted-content"') || !popup.includes('contenteditable="true"')) {
  throw new Error("Rich pasted-text controls are missing from the built popup.");
}
for (const dist of [firefoxDist, chromeDist]) {
  for (const size of [16, 32, 48, 64, 96, 128]) {
    if (!existsSync(join(dist, "icons", `icon-${size}.png`))) throw new Error(`Generated ${size}px icon is missing from ${dist}.`);
  }
  for (const name of ["content.js", "popup.js", "popup.html", "popup.css", "background.js", "options.js", "options.html", "options.css"]) {
    if (!existsSync(join(dist, name))) throw new Error(`${name} is missing from ${dist}.`);
  }
  if (!existsSync(join(dist, "LICENSE"))) throw new Error(`MPL-2.0 LICENSE is missing from ${dist}.`);
  if (!existsSync(join(dist, "READABILITY-LICENSE.txt"))) throw new Error(`Mozilla Readability license notice is missing from ${dist}.`);
  for (const locale of ["en", "ru"]) {
    if (!existsSync(join(dist, "_locales", locale, "messages.json"))) throw new Error(`${locale} messages are missing from ${dist}.`);
  }
}
const englishKeys = new Set(Object.keys(localeMessages.en));
const russianKeys = new Set(Object.keys(localeMessages.ru));
for (const key of englishKeys) if (!russianKeys.has(key)) throw new Error(`Russian locale is missing ${key}.`);
for (const key of russianKeys) {
  if (!englishKeys.has(key) && !/_((few)|(many))$/.test(key)) throw new Error(`English locale is missing ${key}.`);
}
for (const [name, source] of Object.entries({ popupSource, optionsSource, backgroundSource, contentSource })) {
  if (/[А-Яа-яЁё]/u.test(source)) throw new Error(`${name} still contains a hard-coded Russian interface string.`);
}
for (const [locale, messages] of Object.entries(localeMessages)) {
  const userFacingText = Object.values(messages).map(entry => entry.message).join("\n");
  if (!userFacingText.includes("TabTome")) throw new Error(`${locale} locale is missing the TabTome brand.`);
  if (/Page to E-reader/i.test(userFacingText)) throw new Error(`${locale} locale still contains the retired product name.`);
  if (/local companion/i.test(userFacingText) || /локальн(?:ый|ого|ому|ым|ом|ые|ых|ыми)? компонент/i.test(userFacingText)) {
    throw new Error(`${locale} locale still contains the retired user-facing companion term.`);
  }
}
for (const html of [popup, optionsHtml]) {
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([a-z0-9_]+)"/g)) {
    if (!englishKeys.has(match[1]) || !russianKeys.has(match[1])) throw new Error(`HTML translation key is missing: ${match[1]}.`);
  }
}
if (!popupScript.includes("_locales/") || !backgroundScript.includes("uiLanguage")) {
  throw new Error("Runtime locale loading or the manual language setting is missing.");
}
if (!iconSource.includes("#003049") || !iconSource.toLowerCase().includes("#ffb000") || /arrow/i.test(iconSource)) {
  throw new Error("Selected navy/orange open-book icon source is missing or contains the removed arrow.");
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
if (!popup.includes('id="without-images"') || !popup.includes('id="selected-count"') || !popup.includes('id="tab-search"')) {
  throw new Error("Version 0.9 popup controls are missing.");
}
if (!backgroundSource.includes('ptMessage("action_title")') || !popupScript.includes("deliveryTargets") || !backgroundScript.includes("destinationId") || !backgroundScript.includes("tabResults")) {
  throw new Error("Version 0.10 delivery-target capabilities are missing.");
}
if (!backgroundSource.includes('SUCCESS_BADGE_DURATION_MS = 15_000') ||
    !backgroundSource.includes('browser.alarms.create(SUCCESS_BADGE_ALARM') ||
    !backgroundSource.includes('browser.action.getBadgeText({})') ||
    !backgroundSource.includes('if (text === "✓")')) {
  throw new Error("The success badge must clear through a guarded 15-second browser alarm.");
}
if (!popup.includes('id="destination"') || !popup.includes('data-i18n="send_to"')) throw new Error("Destination picker is missing.");

process.stdout.write("Firefox/Chrome extension contract: OK\n");
