# Source build instructions

This source package corresponds to **TabTome extension 0.11.1** and builds both browser packages from the same TypeScript, HTML and CSS source. It requires the TabTome Windows app 0.11.1 and uses Native Messaging protocol 2.

The project source code is licensed under the Mozilla Public License 2.0. See `LICENSE`. Bundled third-party packages remain under their own licenses; the notice for the bundled Mozilla Readability source is in `READABILITY-LICENSE.txt`.

## Requirements

- Node.js 20 or later
- npm 10 or later

The submitted source archive was verified with Node.js 26.7.0 and npm 11.19.0 on Windows. All dependency versions and integrity hashes are fixed in `package-lock.json`.

## Reproduce the submitted extension

Run from the root of this source package:

```text
npm ci
npm run build
```

The generated Firefox files are written to `dist/`; the Chrome files are written to `dist-chrome/`. Use `npm run build:firefox` or `npm run build:chrome` to build only one target.

```text
manifest.json
content.js
background.js
popup.js
popup.html
popup.css
options.js
options.html
options.css
_locales/en/messages.json
_locales/ru/messages.json
icons/icon-16.png
icons/icon-32.png
icons/icon-48.png
icons/icon-64.png
icons/icon-96.png
icons/icon-128.png
```

The Chrome output has the same file layout. Its generated `manifest.json` comes from `manifest.chrome.json` and uses a Manifest V3 extension service worker. The Firefox output comes from `manifest.json` and retains the Gecko-only settings required by AMO.

The TypeScript, HTML, and CSS source files are intentionally stored at the
archive root. This flat layout avoids platform-specific path separators in the
AMO source-upload validator. `manifest.chrome.json` is included alongside the
Firefox manifest. The same build script also supports the regular
project layout where these files are stored in `src/`. In the flat source
archive, generated icon PNG files are also stored at the archive root; the
build script copies them into each target's `icons/` directory. The locale
sources are named `messages.en.json` and `messages.ru.json` in the flat source
archive and are restored to `_locales/<locale>/messages.json` during the build.

The build uses esbuild to compile TypeScript and combines the official [`@mozilla/readability`](https://github.com/mozilla/readability) source with the content script. `npm ci` downloads only the versions fixed in `package-lock.json`; the build itself does not use environment variables or network services. The separately distributed Windows Native Messaging host is not part of the browser extension and is not required to reproduce this add-on package.
