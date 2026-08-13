# ADR 0003: Watchdog restart and log policy

- Date: 2026-08-07
- Status: superseded by ADR 0004

## Context

Task Scheduler was unavailable without elevation, VBS is deprecated, and a persistent PowerShell wrapper used excessive memory. A fixed restart loop can become noisy when startup fails repeatedly or the port is already occupied.

## Decision

A hidden `cmd.exe` watchdog launches Node.js. Exit code 10 means `EADDRINUSE` and stops the watchdog. Other exits back off through 5, 10, 30, and 60 seconds using `ping` as a non-interactive delay. After one stable hour the delay resets. A second watchdog loses the port race and stops. Logs rotate at 5 MB, retain one previous file, and redact email addresses and token-shaped values.

## Consequences

The wrapper remains lightweight and cannot busy-loop through `timeout` stdin behavior. Port conflicts require the user to stop the manually launched server or the existing monitored instance before starting another.

## Superseded

Version 0.6.0 removed the persistent HTTP server and watchdog. Firefox now starts the local process on demand through Native Messaging; log rotation and redaction remain in effect.
