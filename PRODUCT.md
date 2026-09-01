# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and minimal JavaScript, selected for direct Netlify deployment without a build step. The repository also contains the Firefox/Chrome extension and Windows native component.

## Users

Primary users are Russian- and English-speaking Windows owners of Kindle or PocketBook devices who want to move articles or pasted material from a browser to an e-reader without a developer-operated cloud service. Firefox is the supported browser. A manually installed Chrome/Chromium build is experimental.

## Product Purpose

TabTome turns one or more already-open browser pages, or formatted text pasted by the user, into an EPUB and sends it to a configured Kindle or PocketBook address. The landing page must let a first-time visitor understand the workflow, install the supported components, configure delivery, and find troubleshooting and privacy information.

## Positioning

The extension extracts the rendered page already open in the user's browser through Mozilla Readability, passes sanitized content to a short-lived Windows native component, builds the EPUB locally, and sends it through SMTP configured by the user. The developer operates no content-processing backend and receives no pages, books, email addresses, passwords, or usage analytics.

## Operating Context

The normal flow is: install the browser extension, install the TabTome Windows app, enter SMTP and e-reader delivery settings, open one or more articles, select them in the popup, and send. A second flow accepts formatted text and images pasted into the popup. Kindle and PocketBook are selectable delivery targets.

## Capabilities and Constraints

- Windows 10 1809 or newer, x64-compatible.
- Firefox is the supported public distribution target; Chrome/Chromium is a manual experimental installation for now.
- The landing page, public GitHub documentation, and extension interface must support Russian and English.
- The landing page uses separate `/ru/` and `/en/` URLs plus a visible language switcher.
- The Firefox extension is publicly available from Mozilla Add-ons. The Windows app is currently distributed as an explicitly unsigned GitHub pre-release until Authenticode signing is available.
- No accounts, forms, analytics, cookies, advertising, or remote application backend.
- Netlify is the intended landing-page host; downloadable release binaries should ultimately live in public GitHub Releases.
- The public name is TabTome. Browser names may describe compatibility but are not part of the product name.

## Brand Commitments

The public product name is **TabTome**. Compatibility identifiers may retain the former technical prefix but must not be presented as the product name. The extension icon uses a dark-navy field (`#003049`) with a high-contrast orange open-book symbol (`#FFB000`) and no directional arrow. The landing page uses a warm paper-and-ink palette derived from the Channel 12 cover system (`#F1E8E1`, `#E1D7C3`, and near-black), while orange remains a rare functional accent. Copy is factual, restrained, and explicit about the required Windows app, local processing, supported browsers, and current limitations. It must not imply endorsement by Amazon, PocketBook, Mozilla, Google, or browser vendors.

## Evidence on Hand

- Working Firefox extension and Windows native component.
- Shared Chrome build tested manually at the interface level.
- Existing extension icon at `extension/icons/icon-128.png`.
- Existing popup and settings screenshots under `work/ui-*`.
- Automated server, type, packaging, native-protocol, and browser-contract tests.
- No testimonials, install counts, press mentions, independent security audit, or public performance benchmarks; the landing page must not invent them.

## Product Principles

- Explain the two-part installation before asking for a download.
- Lead with the reader's outcome: selected pages become an EPUB that can be finished on the e-reader, while implementation details serve as proof rather than the opening message.
- Demonstrate the actual page-to-EPUB workflow instead of relying on generic privacy claims.
- Keep user content under user control: local preparation, user-selected SMTP, no developer backend.
- Keep unsupported or experimental paths visibly separate from the supported Firefox path.
- Maintain feature and meaning parity between Russian and English.

## Accessibility & Inclusion

The landing page must remain usable with keyboard navigation, visible focus, reduced motion, high text contrast, semantic landmarks, and responsive layouts from narrow mobile screens through desktop displays.
