# AMO reviewer notes — 0.10.1

This is an extension-only layout bugfix. It adds no permissions and does not change Native Messaging protocol 2 or the native application. Extension 0.10.1 remains compatible with native component 0.10.0.

Firefox clamps extension popup dimensions differently from Chromium. The popup detects Firefox through `browser.runtime.getBrowserInfo` capability availability and uses one outer vertical scroll container. This prevents the browser-clamped popup height from conflicting with a nested tab-list scrollbar. Chromium retains the existing internally scrolling tab list.

The automated Firefox UI test uses a 500 px viewport and 25 tabs. It verifies that the final tab and send button can be reached in tab mode and that the send button can be reached in text mode. Rich-paste sanitization checks remain enabled.

The submitted add-on uses esbuild without minification. `content.ts` is bundled with Mozilla Readability; `background.ts`, `popup.ts` and `options.ts` are transpiled separately. `npm run build` reproduces both browser packages. The flat source archive avoids invalid Windows path separators in AMO's archive validator.
