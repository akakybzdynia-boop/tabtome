# TabTome — landing structure

## Publication model

- Static HTML and CSS, with no JavaScript.
- Netlify deploys the `landing/` directory directly.
- No build command, analytics, cookies, forms, account system or remote application API.
- Release files come from public GitHub Releases; unavailable browser-store links remain disabled controls.

## Routes

```text
/
  Language handoff with visible RU / EN links.

/ru/
  Russian landing page.

/en/
  English landing page with identical structure and meaning.

/ru/privacy/
/en/privacy/
  Privacy policy in both languages.

Status: published on 28 August 2026 at `https://tabtome.netlify.app/`. AMO can use the permanent English privacy-policy URL.

/ru/help/
/en/help/
  Installation, SMTP setup, diagnostics and common failures.

/404.html
  Bilingual route recovery.
```

The landing pages, localized help pages, language handoff, 404 page, privacy pages, shared styles, and three 1280×800 interface screenshots are published on Netlify. A public unsigned GitHub pre-release is available for SignPath review; AMO publication and a signed Windows release remain pending.

Every localized page includes reciprocal absolute `hreflang` links, a visible language switcher that keeps the visitor on the equivalent route, and a canonical `https://tabtome.netlify.app/` URL.

## Primary landing-page sequence

### 1. First viewport: what it does and what must be installed

- One-sentence outcome: turn open browser pages or pasted material into an EPUB and send it to Kindle or PocketBook.
- Show the real mechanism as one readable queue: choose articles → build the EPUB locally → open it on the selected e-reader.
- Primary action: install the supported Firefox extension.
- Secondary action: download the required Windows companion.
- State plainly that both parts are required; the Firefox control remains disabled until the public AMO listing is available.
- State the local-processing advantage in user terms: pages are not uploaded to the developer's server and no TabTome account is required.

### 2. Demonstration: from tabs to one book

- Use actual interface evidence rather than a generic illustration.
- Show multiple selected tabs, the text mode, image preservation and the destination selector.
- Explain that extraction uses the already-open rendered page, including content available after login when the page permits extension access.

### 3. Local-processing boundary

- Explicitly separate what stays on the computer from what leaves it.
- Local: page extraction, sanitization, image processing, EPUB creation, settings and the encrypted email password.
- External only by user configuration: SMTP delivery to the selected e-reader address.
- Developer receives no page content, books, passwords, addresses or analytics.
- Keep SMTP and DPAPI terminology in help and privacy pages, not on the reader-facing home page.

### 4. Capabilities and limits

- One or up to 25 browser tabs.
- Formatted pasted text and images.
- Kindle and PocketBook targets.
- Optional text-only mode.
- Windows and Firefox supported.
- Chrome/Chromium manual build marked experimental.
- Unsupported browser pages, video, forms and source page styles are stated without concealment.

### 5. Installation path

- Install extension from Mozilla Add-ons.
- Install Windows companion.
- Configure SMTP and approved sender addresses.
- Run diagnostics.
- Send a first article.

The steps link to the localized help route for complete instructions.

### 6. Final action and trust links

- Repeat Firefox and Windows actions.
- Link to source code, privacy policy, release notes and troubleshooting.
- Do not add newsletter, account creation or promotional claims.

## Localized content contract

- Russian and English pages are peers; neither is a partial summary.
- Navigation, actions, limitations, privacy statements and installation instructions have meaning parity.
- Product name, protocol names, file names and registry paths remain unchanged between languages.
- Kindle, PocketBook, Firefox, Chrome, Windows and Netlify are compatibility references, not endorsements.

## Public URLs and pending integrations

```text
AMO_FIREFOX_URL
GITHUB_PROJECT_URL = https://github.com/akakybzdynia-boop/tabtome
GITHUB_INSTALLER_URL = https://github.com/akakybzdynia-boop/tabtome/releases
GITHUB_CHROME_ZIP_URL
SUPPORT_URL = https://github.com/akakybzdynia-boop/tabtome/issues
NETLIFY_SITE_URL = https://tabtome.netlify.app/
```

Placeholders must render as unavailable controls or documented preview links; they must never point to `#` while appearing functional.

## Follow-up localization work outside this landing step

- Convert extension manifests to `__MSG_*__` keys.
- Add `_locales/ru/messages.json` and `_locales/en/messages.json`.
- Replace hard-coded popup, options, background status and error strings with localized messages.
- Add parity tests that fail when a key exists in only one locale.
- Split GitHub documentation into a concise bilingual root README plus complete `docs/ru/` and `docs/en/` guides.
- Release the localized extension as a new version rather than mutating an already published package.
