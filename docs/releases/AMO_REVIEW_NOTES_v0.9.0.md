# AMO reviewer notes — 0.9.0

The submitted add-on uses esbuild without minification. `content.ts` is bundled with Mozilla Readability; `background.ts`, `popup.ts` and `options.ts` are transpiled separately. The source archive is flat because this avoids invalid Windows path separators in AMO's archive validator. `npm run build` reproduces the submitted add-on files.

## Permission change

Version 0.9.0 adds `contextMenus`. It creates one item named **Отправить на Киндл** for HTTP(S) pages and selections. The item stores a short, session-memory-only request and opens the normal confirmation popup. It never sends a book immediately. The existing permissions remain unchanged; the add-on still does not request `clipboardRead`.

## Local settings

The options page can read and save the SMTP sender address, Send to Kindle address and a manual Amazon allow-list acknowledgement through Native Messaging. The native host validates these fields and stores them in local `server/data/settings.json`. The protocol does not expose or accept the SMTP password. The password stays in the native component's DPAPI-protected file (or the user's legacy `.env`).

## Session draft and page data

An unfinished rich-text draft may be stored in `browser.storage.session`, which is in-memory and cleared with the Firefox session. The add-on caps its draft at 8 MB and drops draft images if necessary. It removes the draft when a text-send job is accepted. Article bodies, pasted content and images are not written to `browser.storage.local`, the native job ledger or logs.

The background job can continue after an individual tab fails. Only successfully extracted articles are sent; compact per-tab status and errors are retained in the existing local job UI. Remote pasted images continue to be fetched only on explicit send, without credentials, with redirects and private/local literal hosts rejected.
