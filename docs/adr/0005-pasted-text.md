# ADR 0005: pasted plain text

## Decision

Version 0.7.0 adds pasted text as a second mode of the existing extension. The user pastes into a textarea; the extension does not request `clipboardRead`. The native host advertises `pastedText` in its health capabilities while protocol version 1 remains unchanged.

Pasted material is sent as `{ kind: "text", title, text, lang }`. The native component validates a one-million-character limit, XML-escapes the text, converts blank-line-separated blocks to paragraphs and omits the source link. The full text is not stored in browser job state or the native job ledger.

## Consequences

- An old 0.6 host continues to support tab delivery with the 0.7 extension.
- Text mode is disabled until the host advertises `pastedText`.
- A browser restart during pre-host preparation loses the pasted body and requires another paste; persisting sensitive clipboard content was rejected.
- Rich HTML, clipboard images, Markdown and automatic clipboard monitoring are outside this release.
