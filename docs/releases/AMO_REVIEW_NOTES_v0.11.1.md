# AMO reviewer notes — TabTome 0.11.1

Version 0.11.1 is a small toolbar-status reliability update. It does not add permissions, data collection, network destinations, analytics, advertising, or remotely hosted code. Native Messaging protocol remains version 2.

This submission is intended for the public **On this site / Listed** channel. The public project repository is https://github.com/akakybzdynia-boop/tabtome and the privacy policy is https://tab-tome.netlify.app/en/privacy/.

## User-visible change

After a successful send, the green checkmark badge on the toolbar button is now cleared automatically after 15 seconds. The completed job result remains available in local extension storage. Error and interrupted-status badges are not cleared by this rule.

## Implementation

- The existing `alarms` permission is used for a one-shot `browser.alarms` event because Firefox may unload a non-persistent background script before a normal JavaScript timer fires.
- Starting another operation clears the previous success alarm.
- The alarm handler reads the current badge and clears it only if it still contains the success checkmark, so an older alarm cannot erase a newer progress or error badge.

## Reproduction

```text
npm ci
npm run build
```

The generated Firefox package is in `dist/`. The submitted source archive contains the TypeScript source, build script, exact lockfile, project license, and Mozilla Readability notice.

## Separate Windows application

The extension requires the open-source TabTome Windows Native Messaging application. The public unsigned preview and SHA-256 are available at:

https://github.com/akakybzdynia-boop/tabtome/releases/tag/v0.11.1-unsigned-preview

The Windows application is not included in the add-on ZIP or source ZIP and is not needed to reproduce the submitted extension. It builds EPUB files locally and sends them through SMTP only after a user action. It does not run as a permanent service and the project operates no content-processing backend.

The current Windows preview is explicitly labeled as not Authenticode-signed. Its signing policy is public at https://github.com/akakybzdynia-boop/tabtome/blob/main/CODE_SIGNING_POLICY.md.

The historical Gecko ID `page-to-ereader-local@local` and Native Messaging host ID are intentionally retained so existing installations can update without losing their connection or settings after the TabTome rename.
