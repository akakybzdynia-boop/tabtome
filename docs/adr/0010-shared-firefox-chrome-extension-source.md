# ADR 0010: Shared Firefox and Chrome extension source

- Date: 2026-08-14
- Status: accepted

## Context

Firefox and Chrome both support Manifest V3, but they describe the background process differently. Firefox uses `background.scripts` for this add-on, while Chrome requires `background.service_worker`. Firefox also requires Gecko-specific AMO metadata that Chrome must not receive. Runtime APIs are exposed as `browser.*` in Firefox and `chrome.*` in Chrome.

Chrome Native Messaging authorization additionally requires a concrete Chrome extension origin. Its host manifest uses `allowed_origins` and Windows registration under `HKCU\Software\Google\Chrome\NativeMessagingHosts`. The existing Firefox host manifest instead uses `allowed_extensions` and a Mozilla extension ID. Wildcards are not allowed for Chrome origins, so a production Chrome registration cannot be finalized before the stable Chrome extension ID is known.

## Decision

TypeScript, HTML, CSS, Readability integration and icons remain shared. `extension/manifest.json` is the Firefox source manifest; `extension/manifest.chrome.json` is the Chrome source manifest. One build script emits Firefox into `extension/dist` and Chrome into `extension/dist-chrome`.

Chrome output receives a build-time `browser = globalThis.browser ?? globalThis.chrome` compatibility alias and targets Chrome 127+. The minimum is set by `chrome.action.openPopup()`, which is used by the context-menu flow. Chrome uses a classic extension service worker because the generated background bundle is self-contained and has no runtime imports.

Native Messaging disconnect errors are read from both Firefox `Port.error` and Chrome `runtime.lastError`. Long-running preparation continues to persist job state and call extension APIs periodically; durable recovery remains based on alarms and the native job ledger rather than service-worker memory.

## Consequences

Both browser packages are reproducible from one source archive and are checked together. Firefox packaging and AMO metadata remain unchanged.

The Chrome ZIP can be built and inspected now, but sending through the local component is not operational until the Windows installer writes a Chrome-specific host manifest containing the final Chrome extension ID. The Chrome package must not be described as fully installed or end-to-end tested before that registration and a real Chromium runtime test are completed.
