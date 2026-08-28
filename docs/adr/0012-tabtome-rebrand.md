# ADR 0012: TabTome rebrand with stable compatibility identifiers

Date: 2026-08-20

Status: Accepted for 0.11.0.

## Decision

The public product name is **TabTome**. Version 0.11.0 applies this name to the browser UI, Windows settings application, installer, executable metadata, EPUB creator metadata, documentation, website, release archives, and signing configuration.

The following identifiers remain unchanged:

- Firefox extension ID: `page-to-ereader-local@local`;
- Native Messaging host name: `page_to_ereader_local`;
- registry key: `HKCU\Software\Mozilla\NativeMessagingHosts\page_to_ereader_local`;
- environment variables beginning with `PAGE_TO_EREADER_`;
- mutable data directory: `%LOCALAPPDATA%\PageToEreaderLocal`;
- Inno Setup `AppId`: `{868E78F5-E114-41D3-A291-56EC79550552}`.

Fresh installations use `%LOCALAPPDATA%\Programs\TabTome`. In-place upgrades retain the existing installation identity and may retain the previous application directory chosen by Inno Setup. The installer removes obsolete executable and icon filenames after installing `TabTomeHost.exe`, `TabTomeSettings.exe`, and `TabTome.ico`.

## Rationale

Changing the signed Firefox ID or Native Messaging host name would disconnect the published extension from the registered Windows application. Changing the `AppId` would create a second installation instead of updating the existing one. Moving the mutable data directory would require a new migration path and could make configured email addresses, the DPAPI-protected SMTP password, job history, and logs appear to be lost.

Technical identifiers are not shown as the product name. Keeping them is a compatibility measure, not incomplete branding.

## Consequences

- Users can update without re-entering settings or reinstalling a parallel product.
- Source code and diagnostic paths still contain the former technical prefix.
- Documentation must distinguish public branding from compatibility identifiers.
- A future removal of those identifiers requires a separately designed migration and is not part of the rebrand.
