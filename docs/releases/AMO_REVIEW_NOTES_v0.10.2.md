# AMO reviewer notes — 0.10.2

This is an extension-only emergency layout fix. It adds no permissions and does not change Native Messaging protocol 2 or the native application. Extension 0.10.2 remains compatible with native component 0.10.0.

Version 0.10.1 used `max-height: 100vh` on the Firefox popup root. In a real toolbar popup, viewport-relative height depended on the popup's still-unresolved intrinsic height and could collapse the document to a narrow strip. Version 0.10.2 replaces this circular sizing rule with Firefox's stable 600 CSS-pixel popup height and one body scroll container. Chromium retains the existing internally scrolling tab list.

The automated Firefox UI test verifies the 600-pixel root height, 25 tabs, reachability of the final tab and send button in tab mode, and reachability of the send button in text mode. Rich-paste sanitization checks remain enabled.

The submitted add-on uses esbuild without minification. `content.ts` is bundled with Mozilla Readability; `background.ts`, `popup.ts` and `options.ts` are transpiled separately. `npm run build` reproduces both browser packages. The flat source archive avoids invalid Windows path separators in AMO's archive validator.
