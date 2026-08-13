# Source build instructions

This source package corresponds to **Page to E-reader Local 0.8.0**.

## Requirements

- Node.js 20 or later
- npm 10 or later

## Reproduce the submitted extension

Run from the root of this source package:

```text
npm install
npm run build
```

The generated add-on files are written to `dist/`:

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
icons/icon-16.png
icons/icon-32.png
icons/icon-48.png
icons/icon-64.png
icons/icon-96.png
```

The TypeScript, HTML, and CSS source files are intentionally stored at the
archive root. This flat layout avoids platform-specific path separators in the
AMO source-upload validator. The same build script also supports the regular
project layout where these files are stored in `src/`. In the flat source
archive, generated icon PNG files are also stored at the archive root; the
build script copies them into `dist/icons/`.

The build uses esbuild to compile TypeScript and combines the official `@mozilla/readability` source with the content script. No environment variables or network services are needed for the build itself. The separately distributed Windows Native Messaging host is not part of the browser extension and is not required to reproduce this add-on package.
