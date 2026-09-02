import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pages = {
  ru: readFileSync(join(root, "landing", "ru", "privacy", "index.html"), "utf8"),
  en: readFileSync(join(root, "landing", "en", "privacy", "index.html"), "utf8")
};

const publicPages = {
  root: readFileSync(join(root, "landing", "index.html"), "utf8"),
  notFound: readFileSync(join(root, "landing", "404.html"), "utf8"),
  ruHome: readFileSync(join(root, "landing", "ru", "index.html"), "utf8"),
  enHome: readFileSync(join(root, "landing", "en", "index.html"), "utf8"),
  ruHelp: readFileSync(join(root, "landing", "ru", "help", "index.html"), "utf8"),
  enHelp: readFileSync(join(root, "landing", "en", "help", "index.html"), "utf8")
};
const siteCss = readFileSync(join(root, "landing", "assets", "site.css"), "utf8");

if (!existsSync(join(root, "landing", "assets", "privacy.css"))) throw new Error("Privacy page stylesheet is missing.");
if (!existsSync(join(root, "landing", "assets", "site.css"))) throw new Error("Public site stylesheet is missing.");
if (!existsSync(join(root, "landing", "assets", "tabtome-icon.svg"))) throw new Error("Public TabTome icon is missing.");
for (const assetName of ["postal-airmail.svg", "postal-postmark.svg", "postal-vologda.svg", "postal-grandfather.svg", "postal-blank-blue.svg", "postal-blank-yellow.svg"]) {
  if (!existsSync(join(root, "landing", "assets", assetName))) throw new Error(`Postal background asset is missing: ${assetName}`);
  if (!siteCss.includes(`url("${assetName}")`)) throw new Error(`Postal background asset is not referenced: ${assetName}`);
}
for (const assetName of ["postal-blank-blue.svg", "postal-blank-yellow.svg"]) {
  const svg = readFileSync(join(root, "landing", "assets", assetName), "utf8");
  if (/[Ѐ-ӿ]/i.test(svg)) throw new Error(`English postal asset contains Cyrillic text: ${assetName}`);
}

for (const [locale, html] of Object.entries(pages)) {
  for (const required of [
    "<!doctype html>",
    `<html lang="${locale}">`,
    'name="viewport"',
    "TabTome",
    "Native Messaging",
    "SMTP",
    "DPAPI",
    "%LOCALAPPDATA%\\PageToEreaderLocal",
    "github.com/akakybzdynia-boop/tabtome/issues"
  ]) {
    if (!html.includes(required)) throw new Error(`${locale} privacy page is missing: ${required}`);
  }
  if (/<script\b/i.test(html)) throw new Error(`${locale} privacy page must not include scripts or analytics.`);
  if (/TODO|PLACEHOLDER|\[CONTACT/i.test(html)) throw new Error(`${locale} privacy page contains an unresolved placeholder.`);
}

if (!pages.ru.includes('href="/en/privacy/"') || !pages.en.includes('href="/ru/privacy/"')) {
  throw new Error("Privacy page language switch is incomplete.");
}
if (!pages.ru.includes("восьми дней") || !pages.en.includes("eight days")) {
  throw new Error("Job metadata retention is not documented in both languages.");
}
if (!pages.ru.includes("не работает в приватных окнах") || !pages.en.includes("does not run in private")) {
  throw new Error("Private-window behavior is not documented in both languages.");
}

for (const [name, html] of Object.entries(publicPages)) {
  for (const required of ["<!doctype html>", 'name="viewport"', "TabTome"]) {
    if (!html.includes(required)) throw new Error(`${name} page is missing: ${required}`);
  }
  if (/TODO|PLACEHOLDER|_URL_REQUIRED/i.test(html)) throw new Error(`${name} page contains an unresolved placeholder token.`);
  if (/googletagmanager|google-analytics\.com|facebook\.com\/tr/i.test(html)) throw new Error(`${name} page includes analytics or tracking code.`);
}

for (const [locale, home, help, otherLocale] of [
  ["ru", publicPages.ruHome, publicPages.ruHelp, "en"],
  ["en", publicPages.enHome, publicPages.enHelp, "ru"]
]) {
  if (!home.includes(`href="/${otherLocale}/"`)) throw new Error(`${locale} home language switch is incomplete.`);
  if (!help.includes(`href="/${otherLocale}/help/"`)) throw new Error(`${locale} help language switch is incomplete.`);
  for (const required of ['id="benefits"', 'class="value-grid"', 'id="install"']) {
    if (!home.includes(required)) throw new Error(`${locale} home is missing reader-focused section marker: ${required}`);
  }
  if (!home.includes('href="https://addons.mozilla.org/firefox/addon/tabtome/"')) {
    throw new Error(`${locale} home is missing the public Mozilla Add-ons link.`);
  }
  if (!home.includes('href="/assets/tabtome-icon.svg"') || !home.includes('src="/assets/tabtome-icon.svg"')) {
    throw new Error(`${locale} home is missing the TabTome favicon or header icon.`);
  }
  for (const imageName of ["01-tabs-1280x800.png", "02-text-1280x800.png", "03-settings-1280x800.png"]) {
    if (!home.includes(imageName)) throw new Error(`${locale} home is missing screenshot ${imageName}.`);
  }
}

if (!publicPages.ruHome.includes("создаст EPUB на вашем компьютере") || !publicPages.enHome.includes("builds an EPUB on your PC")) {
  throw new Error("The local-processing advantage is not stated early in both languages.");
}

for (const [locale, home] of [["ru", publicPages.ruHome], ["en", publicPages.enHome]]) {
  if (/\b(?:SMTP|DPAPI)\b/.test(home)) throw new Error(`${locale} home exposes implementation terms reserved for help and privacy pages.`);
}

for (const imageName of ["01-tabs-1280x800.png", "02-text-1280x800.png", "03-settings-1280x800.png"]) {
  const imagePath = join(root, "landing", "assets", imageName);
  if (!existsSync(imagePath)) throw new Error(`Public screenshot is missing: ${imageName}`);
  const png = readFileSync(imagePath);
  if (png.length < 24 || png.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${imageName} is not a PNG.`);
  if (png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 800) throw new Error(`${imageName} must be 1280x800.`);
}

process.stdout.write("Public landing, help, privacy pages, and screenshots: OK\n");
