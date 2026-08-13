# ADR 0004: Native Messaging instead of a persistent HTTP server

- Date: 2026-08-08
- Status: accepted

## Context

The extension is the only client of the local Node.js component. A permanently running loopback HTTP server required a port, token, CORS and Host validation, rate limiting, autostart and a watchdog.

## Decision

Firefox launches a short-lived Windows Native Messaging host on demand. A locally compiled Windows GUI launcher starts Node.js without a console window and forwards stdin/stdout/stderr as binary streams. Commands and results use length-prefixed UTF-8 JSON over stdin/stdout. The native application manifest allows only extension ID `page-to-ereader-local@local`. Protocol stdout contains frames only; diagnostics and logs use stderr or files.

All runtime paths are derived from the host module location rather than Firefox's working directory. DPAPI decryption is delayed until `smtp-check` or `send`; health and status commands validate the presence of configuration without materializing the password.

The disk job ledger remains mandatory. A `pending` job abandoned before SMTP is safely retryable; an abandoned `sending` job becomes `interrupted` and requires a human check before a new job ID is created. Per-job lock directories prevent two short-lived host processes from sending the same job concurrently.

## Consequences

Port 3210, the localhost token, watchdog, batch launcher and Windows autostart are removed. Firefox starts Node.js only while health checks, diagnostics, status recovery or sending are active. Installation compiles the launcher and registers one HKCU Native Messaging manifest without requiring administrator rights.
