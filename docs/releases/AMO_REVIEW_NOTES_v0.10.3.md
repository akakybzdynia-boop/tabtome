# AMO reviewer notes — 0.10.3

Version 0.10.3 is an extension-only localization, privacy-disclosure, and packaging update. The separately installed Windows application remains version 0.10.0 and Native Messaging protocol remains version 2.

The project source code is licensed under the Mozilla Public License 2.0. The canonical `LICENSE` file is included in both the add-on and source archives. Bundled Mozilla Readability remains under Apache-2.0 and its package license notice is included as `READABILITY-LICENSE.txt`.

## User-visible changes

- One package now includes English and Russian UI resources under `_locales/en` and `_locales/ru`.
- The default language follows Firefox; users can choose Automatic, Russian, or English on the options page.
- Popup, options, context menu, extension-generated errors, progress, and results use the selected locale.
- The toolbar icon is now a high-contrast orange open book on a dark navy background.
- The technical user-facing term “local companion” was replaced with “Page to E-reader app” or action-oriented status text.
- The English checkbox label “Without images” is now “No images”.

## Data collection declaration and private browsing

`browser_specific_settings.gecko.data_collection_permissions.required` contains:

- `browsingActivity`: selected tab URLs are sent to the native application as part of the user-invoked conversion;
- `websiteContent`: selected page text and images, or content explicitly pasted by the user, are sent for local EPUB creation;
- `personallyIdentifyingInfo`: sender and Kindle/PocketBook email addresses entered on the options page are sent to and stored by the local application.

The extension does not declare `authenticationInfo`. It never reads or receives the SMTP password. The password is entered directly in the separately installed Windows settings application and protected with Windows DPAPI.

All Native Messaging transfer is required for the extension's primary, user-invoked function. The developer operates no processing backend and receives none of this data. The extension includes no analytics, telemetry, advertising, or trackers.

The manifest now uses `"incognito": "not_allowed"`. The native application keeps a local eight-day metadata ledger for duplicate-send protection, so private tabs are deliberately unavailable instead of being persisted.

## Build and source package

The submitted add-on uses esbuild without minification. `content.ts` is bundled with the official `@mozilla/readability` package; `background.ts`, `popup.ts`, and `options.ts` are transpiled separately.

The source archive is intentionally flat because AMO's archive validator previously rejected Windows path separators. It includes `package-lock.json` and `README-SOURCE.md` at the root.

Reproduction steps:

```text
npm ci
npm run build
```

The generated Firefox package is written to `dist/`; the Chrome package is written to `dist-chrome/`. The release packaging check performs `npm ci` in a new system temporary directory and verifies that every generated Firefox and Chrome file is byte-identical to the project build.

The Windows Native Messaging application is not included in the add-on archive and is not needed to reproduce the extension. It is installed separately by the user. The final public installer URL will be provided in the AMO listing before submission.

## Permissions

No new WebExtension API permission was added in 0.10.3. Existing permissions are used as follows:

- `tabs`: list user-opened tabs selected for conversion;
- `scripting`: run the bundled Readability extraction only in selected tabs;
- `storage`: keep interface preferences, in-progress metadata, and a session-only pasted-text draft;
- `alarms`: recover and check background send results;
- `nativeMessaging`: send sanitized selected content to the installed Windows application;
- `contextMenus`: provide the user-invoked Send to e-reader command;
- `<all_urls>`: extract user-selected pages and retrieve their images.
