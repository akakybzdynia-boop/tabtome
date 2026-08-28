# ADR 0009: Per-user Windows installer and split application/data layout

Status: Accepted after 0.9.1; application-directory name amended by ADR 0012 in 0.11.0.

## Decision

Public Windows releases use a per-user Inno Setup installer. The original application directory was `%LOCALAPPDATA%\Programs\PageToEreaderLocal`; fresh TabTome 0.11.0 installations use `%LOCALAPPDATA%\Programs\TabTome`, while in-place upgrades may retain the prior directory. The installer creates the Firefox Native Messaging registration in HKCU and needs no administrator rights or separately installed Node.js.

Mutable files live under `%LOCALAPPDATA%\PageToEreaderLocal`. The launcher passes separate `PAGE_TO_EREADER_SERVER_ROOT` and `PAGE_TO_EREADER_DATA_ROOT` values to the native host. Source-tree and legacy manual launches omit the data override and retain the old `server/` layout.

On first installation, the installer reads the previous Firefox native-host registration. If it points to a legacy project folder, `.env`, `.smtp-pass` and `data/settings.json` are copied only when the corresponding destination does not already exist. Source files are never deleted.

The uninstaller always removes program files and the Firefox registration. User data is retained by default and deleted only after a separate explicit confirmation.

## Consequences

- end users do not install Node.js, npm dependencies or PowerShell scripts;
- application updates cannot erase credentials, settings, job history or logs;
- the installer is currently Windows x64 only;
- the bundled runtime increases installed size, but removes a fragile system dependency;
- public binaries still require Authenticode signing to avoid an unknown-publisher warning.
