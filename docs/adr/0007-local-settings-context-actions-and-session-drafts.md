# ADR 0007: Local settings, context actions and session drafts

Status: Accepted for version 0.9.0.

## Decision

The Firefox extension may edit the sender and Send to Kindle addresses, but not SMTP credentials. The native host owns `server/data/settings.json`, validates writes with Zod and applies saved addresses over `.env` fallbacks. The SMTP password remains in the DPAPI-protected `.smtp-pass` file or the legacy environment file.

The extension adds one confirmation-oriented context-menu command. It records the clicked tab and optional plain-text selection in `browser.storage.session`, then opens the existing popup. The command does not start SMTP directly.

Unfinished rich text is also stored in `browser.storage.session`, capped below Firefox's quota. It is session-only and removed once a send is accepted. The disk job ledger continues to store metadata and state only.

For multi-tab jobs, extraction failures are isolated per tab. If at least one article is prepared, the host receives only the successful articles and the popup shows the omitted tabs. If all tabs fail, SMTP is not started.

## Consequences

- the extension never receives the SMTP password;
- updating an email address no longer requires editing `.env`;
- `contextMenus` is a new required Firefox permission;
- selected text from the context menu is plain text because Firefox exposes it directly; formatted paste remains available in the Text mode;
- a session draft improves recovery without creating a permanent content history;
- partial success is explicit and cannot silently omit a failed tab.
