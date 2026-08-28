import { transform } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// AMO accepts either the normal project layout or a flat source archive.
// The flat variant avoids archive path-separator issues in its upload validator.
const sourceDirectory = existsSync(join(here, "src")) ? join(here, "src") : here;
const iconDirectory = existsSync(join(here, "icons")) ? join(here, "icons") : sourceDirectory;
const localesDirectory = existsSync(join(here, "_locales")) ? join(here, "_locales") : undefined;
const licenseFile = existsSync(join(here, "LICENSE")) ? join(here, "LICENSE") : join(here, "..", "LICENSE");
const readabilityLicenseFile = join(here, "READABILITY-LICENSE.txt");
const iconSizes = [16, 32, 48, 64, 96, 128];

if (!existsSync(licenseFile)) throw new Error("MPL-2.0 LICENSE file is missing.");
if (!existsSync(readabilityLicenseFile)) throw new Error("Mozilla Readability license notice is missing.");

const browserArgument = process.argv.find(argument => argument.startsWith("--browser="));
const requestedBrowser = browserArgument?.slice("--browser=".length) || "all";
if (!["all", "firefox", "chrome"].includes(requestedBrowser)) {
  throw new Error(`Unsupported browser build: ${requestedBrowser}`);
}

const targets = [
  {
    browser: "firefox",
    dist: join(here, "dist"),
    manifest: join(here, "manifest.json"),
    scriptTarget: "firefox142",
    banner: undefined
  },
  {
    browser: "chrome",
    dist: join(here, "dist-chrome"),
    manifest: join(here, "manifest.chrome.json"),
    scriptTarget: "chrome127",
    // Source code uses the Promise-based WebExtensions API through one common name.
    // Chrome 127 implements the APIs used by this extension and exposes them as chrome.*.
    banner: "const browser = globalThis.browser ?? globalThis.chrome;"
  }
].filter(target => requestedBrowser === "all" || target.browser === requestedBrowser);

const readabilityEntry = fileURLToPath(import.meta.resolve("@mozilla/readability"));
const readabilitySource = await readFile(join(dirname(readabilityEntry), "Readability.js"), "utf8");
const contentSource = (await readFile(join(sourceDirectory, "content.ts"), "utf8"))
  .replace(/^import\s+\{\s*Readability\s*\}\s+from\s+["']@mozilla\/readability["'];?\s*/u, "");
const popupSource = await readFile(join(sourceDirectory, "popup.ts"), "utf8");
const backgroundSource = await readFile(join(sourceDirectory, "background.ts"), "utf8");
const optionsSource = await readFile(join(sourceDirectory, "options.ts"), "utf8");
const i18nSource = await readFile(join(sourceDirectory, "i18n.ts"), "utf8");

for (const target of targets) {
  await rm(target.dist, { recursive: true, force: true });
  await mkdir(target.dist, { recursive: true });
  const transformOptions = {
    loader: "ts",
    format: "iife",
    target: target.scriptTarget,
    minify: false,
    ...(target.banner ? { banner: target.banner } : {})
  };
  const [content, popup, background, options] = await Promise.all([
    transform(contentSource, transformOptions),
    transform(`${i18nSource}\n${popupSource}`, transformOptions),
    transform(`${i18nSource}\n${backgroundSource}`, transformOptions),
    transform(`${i18nSource}\n${optionsSource}`, transformOptions)
  ]);

  await Promise.all([
    writeFile(join(target.dist, "content.js"), `(() => {\n${readabilitySource}\n${content.code}\n})();\n`, "utf8"),
    writeFile(join(target.dist, "popup.js"), popup.code, "utf8"),
    writeFile(join(target.dist, "background.js"), background.code, "utf8"),
    writeFile(join(target.dist, "options.js"), options.code, "utf8")
  ]);
  await Promise.all([
    [target.manifest, "manifest.json"],
    [join(sourceDirectory, "popup.html"), "popup.html"],
    [join(sourceDirectory, "popup.css"), "popup.css"],
    [join(sourceDirectory, "options.html"), "options.html"],
    [join(sourceDirectory, "options.css"), "options.css"],
    [licenseFile, "LICENSE"],
    [readabilityLicenseFile, "READABILITY-LICENSE.txt"]
  ].map(([source, name]) => cp(source, join(target.dist, name))));
  await mkdir(join(target.dist, "icons"), { recursive: true });
  if (localesDirectory) {
    await cp(localesDirectory, join(target.dist, "_locales"), { recursive: true });
  } else {
    for (const locale of ["en", "ru"]) {
      const output = join(target.dist, "_locales", locale);
      await mkdir(output, { recursive: true });
      await cp(join(here, `messages.${locale}.json`), join(output, "messages.json"));
    }
  }
  await Promise.all(iconSizes.map((size) =>
    cp(join(iconDirectory, `icon-${size}.png`), join(target.dist, "icons", `icon-${size}.png`))
  ));
}
