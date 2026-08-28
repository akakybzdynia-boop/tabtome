# ADR 0011: Multiple local email delivery targets

Status: Accepted in 0.10.0.

## Context

Kindle and PocketBook can both receive EPUB attachments through device-specific email services, but they use different recipient addresses and allow-list controls. Passing an arbitrary recipient address in each browser command would enlarge the native boundary and make a compromised extension context capable of redirecting mail.

## Decision

Local settings contain a strict list of at most one Kindle and one PocketBook destination plus a default destination. The extension receives these settings for display but sends only the fixed identifier `kindle` or `pocketbook`. The native host resolves and validates the actual address immediately before SMTP. PocketBook addresses are restricted to `@pbsync.com`.

Every durable job entry and completed result records its destination identifier. Reusing a `jobId` with another destination is rejected before EPUB construction or SMTP. Legacy 0.9.1 address settings migrate atomically to one Kindle destination.

## Consequences

Native Messaging protocol is version 2 and version 0.10.0 of the extension is intentionally incompatible with an older host. No new browser permission or cloud service is required. The same SMTP account can deliver to both configured services, provided it is allowed by both recipient accounts.
