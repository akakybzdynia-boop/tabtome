# ADR 0008: DPAPI-only SMTP password storage

Status: Accepted in 0.9.1.

## Decision

The native component accepts an SMTP password only from `server/.smtp-pass`, encrypted by Windows DPAPI for the current Windows user. `SMTP_PASS` from `.env` or an inherited process environment is never used for SMTP.

Before loading normal configuration, the native component checks for a legacy `SMTP_PASS` assignment in `.env`. It creates a DPAPI value in a same-directory temporary file, decrypts it back for equality verification, moves it to `.smtp-pass`, writes a sanitized temporary `.env`, verifies that no assignment remains and atomically replaces the original file. Empty assignments are removed without creating a credential.

If any stage before `.env` replacement fails, the original file remains unchanged and SMTP startup is blocked. If `.smtp-pass` already exists, its decrypted value must match the legacy plaintext before cleanup; a mismatch is treated as a conflict and neither credential is overwritten.

No persistent plaintext backup is created. The original `.env` itself is the recovery copy until all preceding checks have succeeded. This avoids solving migration safety by leaving a second plaintext secret on disk.

## Consequences

- upgrades from older releases are automatic on first native-host or diagnostics launch;
- new installations must run `protect-smtp-password.ps1` under the same non-elevated Windows user as Firefox;
- copying `.smtp-pass` to another Windows account does not produce a usable credential;
- malware already running as the same Windows user remains outside the protection DPAPI can provide.

