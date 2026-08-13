# ADR 0001: Idempotent SMTP send jobs

- Date: 2026-08-07
- Status: accepted, revised for Native Messaging protocol 1

## Context

An SMTP server can accept a message while the Native Messaging connection to the extension is lost. Repeating that request with a new identity may create a duplicate book. Exactly-once delivery cannot be proven across an ambiguous SMTP connection failure because the provider accepts no application idempotency key.

The extension also needs to recover after its popup closes, its event page is unloaded, Firefox restarts, or the local service restarts. Re-uploading a large request merely to learn its outcome wastes time and traffic.

## Decision

Every send has a UUID `jobId`. The server persists these states for eight days:

- `pending`: EPUB work is happening before SMTP; a crash here is safe to retry;
- `sending`: written durably immediately before SMTP is called;
- `completed`: SMTP resolved successfully and the compact result was saved;
- `failed`: the job failed before SMTP and can be retried with the same ID;
- `interrupted`: SMTP had started but its result cannot be proved.

On startup, a stored `pending` entry becomes a retryable `failed` entry. A stored `sending` entry becomes `interrupted`. Failure to persist the `sending` transition is fail-closed: SMTP is not called.

The `job-status` native command lets the extension retrieve an outcome without re-uploading the request. The extension uses a Firefox alarm to query `pending` or `sending` work and keeps its recovery record for seven days, shorter than the host tombstone. A completed duplicate returns its original result. Per-job disk locks prevent separate short-lived host processes from owning the same job concurrently.

An `interrupted` job is never retried automatically. The popup warns the user to check Kindle and the sender mailbox. Only after explicit confirmation does the extension create a new `jobId` and accept the risk of a duplicate.

## Consequences

Lost native responses and extension restarts recover without another large request. Crashes before SMTP remain safely retryable, while ambiguous SMTP failures are surfaced honestly. The eight-day ledger contains no article bodies, images, email addresses, tokens, or passwords.
