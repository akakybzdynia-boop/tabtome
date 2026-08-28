# AMO listing copy for Page to E-reader Local 0.10.3

Prepared: August 18, 2026.

This file contains the public listing text to paste into Mozilla Add-ons. Replace the two marked URL placeholders only after the landing page and GitHub repository are public. Do not replace `SUPPORT_EMAIL_REQUIRED` with a disposable address.

## Basic information

- **Name:** Page to E-reader Local
- **Category:** Other
- **Platform:** Windows only
- **Experimental:** No for the supported Firefox/Windows path. Chrome/Chromium is not part of this AMO listing.
- **Requires payment, non-free services or software, or additional hardware:** No. The separately installed Windows app is free and distributed under MPL-2.0. A user's existing email and e-reader services may have their own terms.
- **License:** Mozilla Public License 2.0
- **Support website:** `GITHUB_ISSUES_URL_REQUIRED`
- **Support email:** `SUPPORT_EMAIL_REQUIRED`
- **Privacy policy:** `PUBLIC_EN_PRIVACY_URL_REQUIRED`

## English (en-US)

### Summary

Turn open pages or pasted text into an EPUB and send it to Kindle or PocketBook from Windows.

The summary is 93 characters including spaces, below AMO's 250-character limit.

### Description

Page to E-reader Local turns one or more pages already open in Firefox, or formatted text you paste, into an EPUB and sends it to a configured Kindle or PocketBook address.

**A separate Windows app is required.** Install it before using the extension. Firefox starts the app only when it needs to build or send a book; it does not run permanently in the background.

**What it can send**

- one page or up to 25 selected tabs in one EPUB;
- formatted pasted text, links, tables, and images;
- page content already rendered in the selected tab, including content available after sign-in when Firefox allows extension access;
- a text-only version when **No images** is selected.

**Where the content goes**

The extension passes the selected, sanitized content to the Page to E-reader app installed on the same Windows account. The app builds the EPUB locally and sends it through the SMTP account you configure to the selected Kindle or PocketBook address. The developer operates no content-processing server and receives no pages, books, email addresses, passwords, history, or analytics.

The SMTP provider and the selected Amazon or PocketBook delivery service receive the email and attachment. Their own terms and privacy policies apply.

**Requirements and limits**

- Windows 10 version 1809 or newer;
- Firefox 142 or newer;
- Page to E-reader app 0.10.0 installed separately;
- an SMTP account and a Kindle or `@pbsync.com` delivery address;
- Firefox internal pages, built-in PDF pages, and add-on store pages cannot be extracted;
- video, forms, fonts, colors, and the source page's active behavior are not copied to the EPUB.

Page to E-reader Local is not affiliated with Amazon, PocketBook, or Mozilla. Their names are used only to describe compatibility.

### Permission explanations

- **Access browser tabs:** lists the tabs from which the user chooses content.
- **Access data for all websites:** extracts only pages the user selects and retrieves images included in those pages.
- **Run scripts in selected tabs:** runs the bundled Mozilla Readability extractor after the user starts a send.
- **Exchange messages with programs other than Firefox:** sends sanitized content to the separately installed Page to E-reader app on the same computer.
- **Store unlimited amount of client-side data / storage:** keeps interface preferences, short send metadata, and a session-only pasted-text draft. Article bodies and images are not kept in the job ledger.
- **Display notifications / alarms:** checks the result of a user-started background send.
- **Context menus:** adds the user-invoked **Send to e-reader** command.

### Release notes

- Added complete English and Russian interface localization with automatic or manual language selection.
- Added the new high-contrast open-book icon.
- Replaced technical “local companion” wording with **Page to E-reader app**.
- Shortened the text-only option to **No images**.
- Declared email-address processing in Firefox's data permissions.
- Disabled use in private windows.
- Added reproducible source packaging and MPL-2.0 license files.

The Windows app remains version 0.10.0 and does not need to be reinstalled for this extension-only update.

## Русский (ru)

### Краткое описание

Собирает EPUB из открытых страниц или вставленного текста и отправляет его на Kindle или PocketBook из Windows.

Краткое описание содержит 111 знаков с пробелами и укладывается в лимит AMO 250 знаков.

### Полное описание

Page to E-reader Local собирает EPUB из одной или нескольких уже открытых страниц Firefox либо из вставленного форматированного текста и отправляет его на настроенный адрес Kindle или PocketBook.

**Требуется отдельное приложение для Windows.** Установите его до начала работы. Firefox запускает приложение только для сборки и отправки книги; постоянно в фоне оно не работает.

**Что можно отправить**

- одну страницу или до 25 выбранных вкладок в одном EPUB;
- форматированный вставленный текст, ссылки, таблицы и изображения;
- уже отрисованное содержимое выбранной вкладки, в том числе доступное после входа на сайт, если Firefox разрешает расширению доступ;
- версию без изображений, если включён режим **Без изображений**.

**Куда передаётся содержимое**

Расширение передаёт выбранное и очищенное содержимое приложению Page to E-reader, установленному в той же учётной записи Windows. Приложение собирает EPUB на компьютере и отправляет его через настроенный вами SMTP-аккаунт на выбранный адрес Kindle или PocketBook. У разработчика нет сервера обработки содержимого; он не получает страницы, книги, email-адреса, пароли, историю отправок или аналитику.

Почтовый провайдер и выбранный сервис доставки Amazon или PocketBook получают письмо и вложение. Для них действуют собственные условия и политики конфиденциальности.

**Требования и ограничения**

- Windows 10 версии 1809 или новее;
- Firefox 142 или новее;
- отдельно установленное приложение Page to E-reader 0.10.0;
- SMTP-аккаунт и адрес доставки Kindle или `@pbsync.com`;
- внутренние страницы Firefox, встроенные PDF и страницы магазина дополнений извлечь нельзя;
- видео, формы, шрифты, цвета и активное поведение исходной страницы в EPUB не переносятся.

Page to E-reader Local не связан с Amazon, PocketBook или Mozilla. Их названия используются только для описания совместимости.

### Объяснение разрешений

- **Доступ к вкладкам браузера:** показывает вкладки, из которых пользователь выбирает содержимое.
- **Доступ к данным на всех сайтах:** извлекает только выбранные пользователем страницы и загружает входящие в них изображения.
- **Запуск кода в выбранных вкладках:** запускает встроенный Mozilla Readability после команды пользователя.
- **Обмен сообщениями с программами вне Firefox:** передаёт очищенное содержимое отдельно установленному приложению Page to E-reader на том же компьютере.
- **Хранилище:** сохраняет настройки интерфейса, короткие сведения об отправках и черновик вставленного текста только на время сеанса. Тексты статей и изображения в журнале заданий не хранятся.
- **Будильники:** проверяет результат отправки, которую запустил пользователь.
- **Контекстное меню:** добавляет команду **Отправить на читалку**.

### Примечания к версии

- Добавлен полный английский и русский интерфейс с автоматическим или ручным выбором языка.
- Добавлена новая контрастная иконка с открытой книгой.
- Техническое название «локальный компонент» заменено на **приложение Page to E-reader**.
- Английская подпись текстового режима сокращена до **No images**.
- Обработка email-адресов указана в декларации данных Firefox.
- Работа в приватных окнах отключена.
- Добавлены воспроизводимый архив исходников и файлы лицензии MPL-2.0.

Приложение Windows остаётся версии 0.10.0; для этого обновления расширения переустанавливать его не требуется.

## Screenshot order and localized captions

Only one image set can be uploaded. The screenshots therefore use the English UI; localize the captions in AMO.

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

- Upload `outputs/1-FIRST-UPLOAD-ADDON-v0.10.3.zip` as the add-on.
- Answer **Yes** to the generated/bundled source-code question.
- Upload `outputs/2-SOURCE-CODE-ONLY-v0.10.3.zip` as source code.
- Paste the contents of `docs/releases/AMO_REVIEW_NOTES_v0.10.3.md` into Notes for Reviewers.
- Select Windows only; do not select Android, Linux, or macOS.
- Select MPL-2.0.
- Add the public English privacy-policy URL.
- Add a monitored support email and the public issue-tracker URL.
- Upload the three screenshots from `outputs/amo-screenshots-v0.10.3/` in the order above.
