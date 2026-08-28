# AMO reviewer notes — 0.10.0

This release adds PocketBook as a second local email delivery target. It adds no Firefox permissions. Native Messaging protocol is intentionally bumped from 1 to 2, so the 0.10.0 extension requires the matching 0.10.0 Windows native component.

The add-on sends only a fixed destination identifier (`kindle` or `pocketbook`) to the native host. Recipient email addresses remain in the native component's local settings and are never accepted as arbitrary send-command fields. PocketBook recipients are restricted to the official `@pbsync.com` domain. Existing 0.9.1 settings migrate locally to a Kindle destination.

Job state includes the destination identifier. A completed, interrupted or retryable `jobId` cannot be reused for another destination. This preserves the existing duplicate-send protection when the user switches devices.

The submitted add-on uses esbuild without minification. `content.ts` is bundled with Mozilla Readability; `background.ts`, `popup.ts` and `options.ts` are transpiled separately. `npm run build` reproduces both browser packages. The flat source archive avoids invalid Windows path separators in AMO's archive validator.
