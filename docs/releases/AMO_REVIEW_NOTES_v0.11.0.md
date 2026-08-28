# AMO reviewer notes — TabTome 0.11.0

Version 0.11.0 renames the user-facing product from **Page to E-reader Local** to **TabTome**. The extension and separately installed Windows application are both version 0.11.0. Native Messaging protocol remains version 2.

## Compatibility identifiers

The following identifiers intentionally retain their previous values so the signed Firefox extension remains connected to existing Windows installations:

- add-on ID: `page-to-ereader-local@local`;
- Native Messaging host: `page_to_ereader_local`;
- allowed extension ID in the native manifest: `page-to-ereader-local@local`.

These values are implementation identifiers, not remotely loaded code or references to another product. Changing them would break in-place updates.

## User-visible changes

- The localized extension name, popup, options page, errors, and context-menu text use TabTome.
- The Windows app, installer, executable metadata, release artifacts, website, and current documentation use TabTome.
- EPUB metadata identifies TabTome as the creator.
- The selected high-contrast navy/orange open-book icon is unchanged.

## Build and source package

The project is licensed under MPL-2.0. Mozilla Readability remains under Apache-2.0 and its notice is included as `READABILITY-LICENSE.txt`.

The submitted add-on is generated with esbuild without minification. `content.ts` is bundled with `@mozilla/readability`; other TypeScript entry points are transpiled separately. Reproduction commands:

```text
npm ci
npm run build
```

The source archive is flat to comply with AMO archive validation. The release script reproduces Firefox and Chrome builds in a new system temporary directory and compares every generated file by SHA-256.

## Data handling and permissions

No permission, collection category, processing backend, analytics, advertising, or telemetry was added in 0.11.0. Native Messaging remains necessary for local EPUB creation and SMTP delivery. The extension never receives the SMTP password; the user enters it in the Windows app, where it is protected with Windows DPAPI.

The existing manifest categories remain:

- `browsingActivity` for selected tab URLs;
- `websiteContent` for selected or pasted content;
- `personallyIdentifyingInfo` for sender and destination email addresses passed to the installed app.

The separately installed Windows app is not included in the add-on archive and is not required to reproduce the extension.
