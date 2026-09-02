# TabTome

<p align="center"><img src="extension/icons/icon-128.png" width="96" height="96" alt="TabTome icon: an open orange book on a dark navy background"></p>

[Install from Mozilla Add-ons](https://addons.mozilla.org/firefox/addon/tabtome/) · [Русская версия](README.md) · [Website](https://tab-tome.netlify.app/en/) · [Privacy policy](https://tab-tome.netlify.app/en/privacy/)

TabTome turns one or more pages already open in Firefox, or formatted text pasted by the user, into an EPUB and sends it to Kindle or PocketBook through the user's own SMTP account.

The system has two parts:

1. The Firefox extension extracts selected rendered pages with Mozilla Readability or accepts pasted text and images.
2. The TabTome app for Windows starts on demand, sanitizes the content again, builds the EPUB locally, and sends it to the selected e-reader address.

The developer operates no content-processing backend. Page content, books, email addresses, passwords, job history, and diagnostics are not sent to the developer. The SMTP provider and the selected Amazon or PocketBook delivery service receive the email and attachment under their own terms.

Current public Firefox extension: **0.11.2**. Current Windows app: **0.11.1**. Both use Native Messaging protocol **2**. Firefox is the supported browser. A Chrome/Chromium build is generated from the same source but remains experimental because the Windows installer does not yet register its Native Messaging origin.

## Requirements

- 64-bit Windows 10 version 1809 or newer;
- Firefox 142 or newer;
- an SMTP account;
- a Send to Kindle address and/or a Send-to-PocketBook address ending in `@pbsync.com`.

The Windows installer includes its own pinned Node.js 24 LTS runtime. Users do not need to install Node.js, npm, PowerShell modules, or a permanent background service.

## Main features

- sends one page or up to 25 selected tabs as one EPUB;
- accepts up to 1,000,000 characters of pasted text;
- preserves headings, paragraphs, emphasis, lists, quotes, code, links, tables, and selected images;
- includes an optional **Only text** mode;
- provides a **Send to e-reader** context-menu command for the current page or selected text;
- supports separate Kindle and PocketBook delivery profiles;
- extracts content from the already rendered tab, including content available after sign-in when Firefox permits extension access;
- processes up to 30 images per article and up to 15 MB of source images per send;
- rejects an EPUB larger than 18 MB before SMTP;
- stores only short job metadata for eight days to prevent duplicate sends;
- stores the SMTP password only in a Windows DPAPI-protected file that the extension cannot read.

Firefox internal pages, built-in PDF pages, and add-on store pages cannot be extracted. Video, forms, fonts, colors, and active page behavior are not copied into the EPUB.

## Install on Windows

Signed installer download links will be added after SignPath approval and publication of the first GitHub Release. The source repository is public now.

1. Install `TabTome-Setup-0.11.1.exe` as the current Windows user. Administrator rights are not required. A fresh installation uses `%LOCALAPPDATA%\Programs\TabTome` and registers the app for Firefox through the current-user Native Messaging registry key. The legacy data directory and technical IDs are retained during upgrades for compatibility.
2. Open **TabTome** from the Start menu. Enter the sender address, Kindle and/or PocketBook address, default destination, SMTP settings, and the SMTP app password. For Gmail, use a Google app password rather than the normal account password.
3. Add the sender to the appropriate Amazon or PocketBook allowlist, confirm only the services you configured, then select **Save and test SMTP**.
4. [Install the signed TabTome 0.11.2 extension from Mozilla Add-ons](https://addons.mozilla.org/firefox/addon/tabtome/) and restart Firefox completely.
5. Open the extension settings and run the 20 MB channel test. This checks the real Firefox-to-app channel without building an EPUB or sending email.
6. Open the popup, select one or more tabs or paste content in **Text**, choose the destination, and send.

The app is launched by Firefox only for health checks, settings, diagnostics, and send operations. There is no localhost port, watchdog, Windows logon autostart, or permanent Node.js process.

Program files and user data are separate:

```text
%LOCALAPPDATA%\Programs\TabTome             program and bundled runtime on a clean install
%LOCALAPPDATA%\PageToEreaderLocal           settings, DPAPI password, jobs, logs
```

An in-place Inno Setup upgrade may retain the previous program directory. The application identity, user-data path, and Native Messaging IDs remain stable so an update does not create a second installation or lose settings.

An update keeps user data. Uninstalling offers a separate choice to retain or permanently remove it.

## Diagnostics

Open **TabTome** from the Start menu to inspect settings and logs. The installed log is stored at `%LOCALAPPDATA%\PageToEreaderLocal\logs\service.log` and rotates at 5 MB.

From a source checkout:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\run-diagnostics.ps1
```

If the extension reports that the TabTome app was not found, reinstall the current Windows installer, close all Firefox windows, start Firefox again, and run diagnostics. `install-native-host.ps1` is only for development or recovery from a source checkout.

## Privacy and security

- [English privacy policy](landing/en/privacy/index.html)
- [Русская политика конфиденциальности](landing/ru/privacy/index.html)
- [Security model](SECURITY.md)
- [Code signing policy](CODE_SIGNING_POLICY.md) ([Russian](CODE_SIGNING_POLICY.ru.md))

The extension does not run in private windows. Content moves outside the extension only after a direct user command: first to the locally installed Windows app, then through the SMTP provider to the selected e-reader service.

## Build and test

Development requires Node.js 20 or newer. On Windows PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks `npm`.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
```

Browser builds:

```powershell
npm.cmd run build:firefox
npm.cmd run build:chrome
```

Firefox output is written to `extension/dist`; Chrome output is written to `extension/dist-chrome`. Windows installer build and isolated verification are documented in [docs/WINDOWS_INSTALLER.md](docs/WINDOWS_INSTALLER.md). Architectural decisions are recorded in [docs/adr](docs/adr).

The repository includes a normal Windows CI workflow and a separate manual SignPath workflow. The signing workflow is intentionally inactive until the SignPath open-source application and repository secrets are configured. It accepts only a matching `windows-v<application-version>` tag and never creates a GitHub Release. Setup is documented in [docs/SIGNPATH_SETUP.md](docs/SIGNPATH_SETUP.md).

## AMO source submission

The add-on archive must contain only the flat contents of `extension/dist`, with `manifest.json` at the ZIP root. Do not upload the full project, `server`, `host`, `node_modules`, or user configuration.

The build uses esbuild and bundles Mozilla Readability, so answer **Yes** when AMO asks whether generated or bundled code is used and upload the separate reproducible source archive. Public listing copy and reviewer material are stored under [docs/releases](docs/releases).

## License and third-party code

Project source is licensed under the [Mozilla Public License 2.0](LICENSE). Mozilla Readability is distributed under the Apache License 2.0; its notice is preserved in [extension/READABILITY-LICENSE.txt](extension/READABILITY-LICENSE.txt). Other dependencies retain their own licenses.

TabTome is not affiliated with Amazon, PocketBook, Mozilla, Google, or browser vendors. Their names are used only to describe compatibility.
