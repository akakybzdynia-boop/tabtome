# AMO reviewer notes — 0.9.1

This is a security maintenance release. It adds no Firefox permission and does not change the Native Messaging protocol.

The submitted add-on uses esbuild without minification. `content.ts` is bundled with Mozilla Readability; `background.ts`, `popup.ts` and `options.ts` are transpiled separately. The source archive is flat to avoid invalid Windows path separators in AMO's archive validator. `npm run build` reproduces the submitted add-on files.

## Password-storage change

The extension still cannot read or write the SMTP password. The local Windows native component no longer accepts `SMTP_PASS` from `.env` or inherited environment variables as runtime credentials. A legacy `.env` value is encrypted with Windows DPAPI and round-trip verified before an atomic sanitized replacement removes the plaintext assignment. Failure blocks SMTP and leaves the original configuration untouched; an existing conflicting DPAPI value is never overwritten automatically.

The manual `protect-smtp-password.ps1` path now performs the same cleanup. New installations receive an `.env.example` without an SMTP password field.

