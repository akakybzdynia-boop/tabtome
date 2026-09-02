# AMO reviewer notes — TabTome extension 0.11.2

This submission is intended for the public **On this site / Listed** channel.

Version 0.11.2 contains the same functional extension code as the already approved unlisted version 0.11.1. The version number was increased solely because version 0.11.1 had already been used in the self-distribution channel before the public AMO listing was prepared.

There are no new permissions, data-collection categories, network destinations, analytics, advertising, or remotely hosted code. Native Messaging protocol remains version 2, and the compatible Windows application remains version 0.11.1.

## Reproduction

```text
npm ci
npm run build
```

The generated Firefox package is in `dist/`. The submitted source archive contains the TypeScript source, build script, exact lockfile, project license, and Mozilla Readability notice.

## Project and privacy information

- Public source repository: https://github.com/akakybzdynia-boop/tabtome
- Privacy policy: https://tab-tome.netlify.app/en/privacy/
- Windows application preview: https://github.com/akakybzdynia-boop/tabtome/releases/tag/v0.11.1-unsigned-preview

The Windows application is separate from the extension ZIP and is not required to reproduce the submitted browser code. It builds EPUB files locally and sends them through the SMTP account configured by the user. The developer operates no content-processing backend.

The historical Gecko ID `page-to-ereader-local@local` and Native Messaging host ID are intentionally retained so existing installations can update without losing their connection or settings after the TabTome rename.
