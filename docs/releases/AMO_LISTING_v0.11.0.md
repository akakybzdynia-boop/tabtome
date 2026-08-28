# AMO listing copy for TabTome 0.11.0

Prepared: August 20, 2026.

Replace the URL and support-email placeholders only after the public pages and repository are available.

## Basic information

- **Name:** TabTome
- **Category:** Other
- **Platform:** Windows only
- **License:** Mozilla Public License 2.0
- **Support website:** `GITHUB_ISSUES_URL_REQUIRED`
- **Support email:** `SUPPORT_EMAIL_REQUIRED`
- **Privacy policy:** `PUBLIC_EN_PRIVACY_URL_REQUIRED`

## English (en-US)

### Summary

Turn open pages or pasted text into an EPUB and send it to Kindle or PocketBook from Windows.

### Description

TabTome turns one or more pages already open in Firefox, or formatted text you paste, into an EPUB and sends it to a configured Kindle or PocketBook address.

**A separate free Windows app is required.** Firefox starts it only while checking settings, building an EPUB, or sending a book. It does not run permanently in the background.

**What TabTome can send**

- one page or up to 25 selected tabs in one EPUB;
- formatted pasted text, links, tables, and images;
- page content already rendered in a selected tab, including content available after sign-in when Firefox grants extension access;
- a text-only version when **Only text** is selected.

**Where the content goes**

The extension passes the selected, sanitized content to the TabTome app installed under the same Windows account. The app builds the EPUB locally and sends it through the SMTP account you configure to the selected Kindle or PocketBook address. The developer operates no processing server and receives no pages, books, email addresses, passwords, history, or analytics.

The configured SMTP provider and selected Amazon or PocketBook delivery service receive the email and attachment. Their terms and privacy policies apply.

**Requirements and limits**

- Windows 10 version 1809 or newer;
- Firefox 142 or newer;
- TabTome app 0.11.0 installed separately;
- an SMTP account and a Kindle or `@pbsync.com` delivery address;
- Firefox internal pages, built-in PDF pages, and add-on store pages cannot be extracted;
- video, forms, fonts, colors, and active page behavior are not copied to the EPUB.

TabTome is not affiliated with Amazon, PocketBook, or Mozilla. Their names describe compatibility only.

### Permission explanations

- **Access browser tabs:** lists the tabs from which the user chooses content.
- **Access data for all websites:** extracts only pages the user selects and retrieves included images.
- **Run scripts in selected tabs:** runs the bundled Mozilla Readability extractor after the user starts a send.
- **Exchange messages with programs other than Firefox:** sends sanitized content to the separately installed TabTome app on the same computer.
- **Storage:** keeps interface preferences, short send metadata, and a session-only pasted-text draft. Article bodies and images are not kept in the job ledger.
- **Alarms:** checks the result of a user-started background send.
- **Context menus:** adds the user-invoked **Send to e-reader** command.

### Release notes

- Renamed the extension and Windows app to **TabTome**.
- Renamed the Windows installer and executable metadata.
- Kept the existing add-on and Native Messaging identifiers so updates continue to work without reconfiguration.
- Kept SMTP settings and the DPAPI-protected password in the existing local data directory.
- Updated EPUB creator metadata, documentation, website copy, build artifacts, and signing configuration.

## Русский (ru)

### Краткое описание

Собирает EPUB из открытых страниц или вставленного текста и отправляет его на Kindle или PocketBook из Windows.

### Полное описание

TabTome собирает EPUB из одной или нескольких уже открытых страниц Firefox либо из вставленного форматированного текста и отправляет его на настроенный адрес Kindle или PocketBook.

**Требуется отдельное бесплатное приложение для Windows.** Firefox запускает его только для проверки настроек, сборки EPUB или отправки книги; постоянно в фоне оно не работает.

**Что можно отправить**

- одну страницу или до 25 выбранных вкладок в одном EPUB;
- форматированный вставленный текст, ссылки, таблицы и изображения;
- уже отрисованное содержимое выбранной вкладки, в том числе доступное после входа на сайт, если Firefox разрешает расширению доступ;
- версию без изображений, если включён режим **Без изображений**.

**Куда передаётся содержимое**

Расширение передаёт выбранное и очищенное содержимое приложению TabTome, установленному в той же учётной записи Windows. Приложение собирает EPUB на компьютере и отправляет его через настроенный SMTP-аккаунт на выбранный адрес Kindle или PocketBook. У разработчика нет сервера обработки содержимого; он не получает страницы, книги, email-адреса, пароли, историю отправок или аналитику.

Почтовый провайдер и выбранный сервис доставки Amazon или PocketBook получают письмо и вложение. Для них действуют собственные условия и политики конфиденциальности.

**Требования и ограничения**

- Windows 10 версии 1809 или новее;
- Firefox 142 или новее;
- отдельно установленное приложение TabTome 0.11.0;
- SMTP-аккаунт и адрес доставки Kindle или `@pbsync.com`;
- внутренние страницы Firefox, встроенные PDF и страницы магазина дополнений извлечь нельзя;
- видео, формы, шрифты, цвета и активное поведение исходной страницы в EPUB не переносятся.

TabTome не связан с Amazon, PocketBook или Mozilla. Их названия используются только для описания совместимости.

### Объяснение разрешений

- **Доступ к вкладкам браузера:** показывает вкладки, из которых пользователь выбирает содержимое.
- **Доступ к данным на всех сайтах:** извлекает только выбранные пользователем страницы и загружает входящие в них изображения.
- **Запуск кода в выбранных вкладках:** запускает встроенный Mozilla Readability после команды пользователя.
- **Обмен сообщениями с программами вне Firefox:** передаёт очищенное содержимое отдельно установленному приложению TabTome на том же компьютере.
- **Хранилище:** сохраняет настройки интерфейса, короткие сведения об отправках и черновик вставленного текста только на время сеанса.
- **Будильники:** проверяет результат отправки, которую запустил пользователь.
- **Контекстное меню:** добавляет команду **Отправить на читалку**.

### Примечания к версии

- Расширение и приложение Windows переименованы в **TabTome**.
- Переименованы установщик и метаданные исполняемых файлов.
- Сохранены прежние ID расширения и Native Messaging, поэтому обновление не требует повторной настройки.
- SMTP-настройки и защищённый DPAPI-пароль остаются в прежнем локальном каталоге данных.
- Обновлены метаданные EPUB, документация, сайт, release-архивы и конфигурация подписи.

## Screenshot order and localized captions

1. `01-tabs-1280x800.png`
   - EN: **Select one or several open tabs and send them as one EPUB.**
   - RU: **Выберите одну или несколько открытых вкладок и отправьте их одним EPUB.**
2. `02-text-1280x800.png`
   - EN: **Paste formatted text and images, then send them from the same popup.**
   - RU: **Вставьте форматированный текст и изображения и отправьте их из того же окна.**
3. `03-settings-1280x800.png`
   - EN: **Choose a language and configure Kindle or PocketBook delivery. The SMTP password stays in the Windows app.**
   - RU: **Выберите язык и настройте доставку на Kindle или PocketBook. SMTP-пароль остаётся в приложении Windows.**

## Submission checklist

- Upload `outputs/1-TABTOME-FIREFOX-ADDON-v0.11.0.zip` as the add-on.
- Answer **Yes** to the generated/bundled source-code question.
- Upload `outputs/2-TABTOME-SOURCE-CODE-v0.11.0.zip` as source code.
- Paste `docs/releases/AMO_REVIEW_NOTES_v0.11.0.md` into Notes for Reviewers.
- Select Windows only; do not select Android, Linux, or macOS.
- Select MPL-2.0 and add the public English privacy-policy URL.
- Upload the screenshots from `outputs/amo-screenshots-v0.11.0/` in the order above.
