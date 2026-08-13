import { transform } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
// AMO accepts either the normal project layout or a flat source archive.
// The flat variant avoids archive path-separator issues in its upload validator.
const sourceDirectory = existsSync(join(here, "src")) ? join(here, "src") : here;
const iconDirectory = existsSync(join(here, "icons")) ? join(here, "icons") : sourceDirectory;
const iconSizes = [16, 32, 48, 64, 96];
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const readabilityEntry = fileURLToPath(import.meta.resolve("@mozilla/readability"));
const readabilitySource = await readFile(join(dirname(readabilityEntry), "Readability.js"), "utf8");
const contentSource = (await readFile(join(sourceDirectory, "content.ts"), "utf8"))
  .replace(/^import\s+\{\s*Readability\s*\}\s+from\s+["']@mozilla\/readability["'];?\s*/u, "");
const popupSource = await readFile(join(sourceDirectory, "popup.ts"), "utf8");
const backgroundSource = await readFile(join(sourceDirectory, "background.ts"), "utf8");
const optionsSource = await readFile(join(sourceDirectory, "options.ts"), "utf8");
const transformOptions = { loader: "ts", format: "iife", target: "firefox140", minify: false };
const [content, popup, background, options] = await Promise.all([
  transform(contentSource, transformOptions),
  transform(popupSource, transformOptions),
  transform(backgroundSource, transformOptions),
  transform(optionsSource, transformOptions)
]);

await Promise.all([
  writeFile(join(dist, "content.js"), `(() => {\n${readabilitySource}\n${content.code}\n})();\n`, "utf8"),
  writeFile(join(dist, "popup.js"), popup.code, "utf8"),
  writeFile(join(dist, "background.js"), background.code, "utf8"),
  writeFile(join(dist, "options.js"), options.code, "utf8")
]);
await Promise.all([
  [join(here, "manifest.json"), "manifest.json"],
  [join(sourceDirectory, "popup.html"), "popup.html"],
  [join(sourceDirectory, "popup.css"), "popup.css"],
  [join(sourceDirectory, "options.html"), "options.html"],
  [join(sourceDirectory, "options.css"), "options.css"]
].map(([source, name]) => cp(source, join(dist, name))));
await mkdir(join(dist, "icons"), { recursive: true });
await Promise.all(iconSizes.map((size) =>
  cp(join(iconDirectory, `icon-${size}.png`), join(dist, "icons", `icon-${size}.png`))
));
