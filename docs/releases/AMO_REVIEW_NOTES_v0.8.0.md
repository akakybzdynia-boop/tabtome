# AMO reviewer notes — 0.8.0

This extension uses esbuild, so a separate source archive is provided. Run `npm install` and `npm run build` from that archive; the generated files appear in `dist/` and are byte-for-byte equivalent to the submitted add-on archive.

Text mode accepts rich content only through a user-initiated paste or drop event in a `contenteditable` element. The extension does not request `clipboardRead` and does not call `navigator.clipboard`. It reads `event.clipboardData`, applies a semantic HTML allowlist, removes styles and active elements, and sends the result only to the user-installed Native Messaging component.

Remote image URLs are inert in the editor: they are not assigned to `src`, so paste triggers no network request. An explicit send fetches pasted remote images with `credentials: "omit"`, rejects redirects and literal private/local addresses, and aborts with a visible error if an image cannot be prepared. The native component validates the request and sanitizes HTML again before EPUB generation.

Article bodies, pasted text and images remain in memory and are not written to `browser.storage`, the job ledger or logs. The extension continues to declare `browsingActivity` and `websiteContent` because it reads user-selected open tabs. Version 0.8.0 adds no browser permissions compared with 0.7.0.

The icon is an original project asset and contains no Mozilla, Firefox, Amazon or Kindle trademark artwork.
