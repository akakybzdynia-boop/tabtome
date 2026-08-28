# AMO reviewer notes — TabTome 0.11.1

Version 0.11.1 is a small toolbar-status reliability update. It does not add permissions, data collection, network destinations, analytics, advertising, or remotely hosted code. Native Messaging protocol remains version 2.

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
