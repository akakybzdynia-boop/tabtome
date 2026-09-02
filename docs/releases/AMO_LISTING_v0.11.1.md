# AMO public listing — TabTome 0.11.1

Prepared: August 28, 2026.

## Basic information

- **Distribution:** On this site / Listed
- **Name:** TabTome
- **Category:** Other
- **Platform:** Firefox for Windows only
- **License:** Mozilla Public License 2.0
- **Homepage:** `https://tab-tome.netlify.app/en/`
- **Support website:** `https://github.com/akakybzdynia-boop/tabtome/issues`
- **Privacy policy:** `https://tab-tome.netlify.app/en/privacy/`
- **Windows app download:** `https://github.com/akakybzdynia-boop/tabtome/releases/tag/v0.11.1-unsigned-preview`
- **Source repository:** `https://github.com/akakybzdynia-boop/tabtome`

Do not add a public support email unless the maintainer explicitly chooses one. GitHub Issues is the public support channel.

## English (en-US)

### Summary

Turn open pages or pasted text into an EPUB and send it to Kindle or PocketBook from Windows.

### Description

TabTome turns one or more pages already open in Firefox, or formatted text you paste, into an EPUB and sends it to a configured Kindle or PocketBook address.

**A separate free Windows app is required.** Download it from the [TabTome releases page](https://github.com/akakybzdynia-boop/tabtome/releases/tag/v0.11.1-unsigned-preview). The current public preview is not yet Authenticode-signed, so Windows may display an unknown-publisher warning. Its SHA-256 checksum and complete source code are published with the release. Firefox starts the app only while checking settings, building an EPUB, or sending a book; it does not run permanently in the background.

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
- TabTome app 0.11.1 installed separately;
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
- **Alarms:** clears the success badge after 15 seconds and checks the result of a user-started background send.
- **Context menus:** adds the user-invoked **Send to e-reader** command.

### Release notes

- The green success checkmark on the toolbar button now clears automatically 15 seconds after a book is sent.
- A new send or status cancels the previous clear timer, so an older timer cannot hide newer progress or error information.
- The completed send result remains available when the badge clears.

No permissions or data-collection behavior changed.

## Русский (ru)

### Краткое описание

Собирает EPUB из открытых страниц или вставленного текста и отправляет его на Kindle или PocketBook из Windows.

### Полное описание

TabTome собирает EPUB из одной или нескольких уже открытых страниц Firefox либо из вставленного форматированного текста и отправляет его на настроенный адрес Kindle или PocketBook.

**Требуется отдельное бесплатное приложение для Windows.** Оно доступно на [странице выпусков TabTome](https://github.com/akakybzdynia-boop/tabtome/releases/tag/v0.11.1-unsigned-preview). Текущая публичная предварительная сборка ещё не подписана Authenticode, поэтому Windows может показать предупреждение о неизвестном издателе. Вместе с установщиком опубликованы SHA-256 и полный исходный код. Firefox запускает приложение только для проверки настроек, сборки EPUB или отправки книги; постоянно в фоне оно не работает.

**Что можно отправить**

- одну страницу или до 25 выбранных вкладок в одном EPUB;
- форматированный вставленный текст, ссылки, таблицы и изображения;
- уже отрисованное содержимое выбранной вкладки, в том числе доступное после входа на сайт, если Firefox разрешает расширению доступ;
- версию без изображений, если включён режим **Только текст**.

**Куда передаётся содержимое**

Расширение передаёт выбранное и очищенное содержимое приложению TabTome, установленному в той же учётной записи Windows. Приложение собирает EPUB на компьютере и отправляет его через настроенный SMTP-аккаунт на выбранный адрес Kindle или PocketBook. У разработчика нет сервера обработки содержимого; он не получает страницы, книги, email-адреса, пароли, историю отправок или аналитику.

Почтовый провайдер и выбранный сервис доставки Amazon или PocketBook получают письмо и вложение. Для них действуют собственные условия и политики конфиденциальности.

**Требования и ограничения**

- Windows 10 версии 1809 или новее;
- Firefox 142 или новее;
- отдельно установленное приложение TabTome 0.11.1;
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
- **Будильники:** убирает значок успешной отправки через 15 секунд и проверяет результат отправки, которую запустил пользователь.
- **Контекстное меню:** добавляет команду **Отправить на читалку**.

### Примечания к версии

- Зелёная галка на кнопке расширения теперь исчезает через 15 секунд после успешной отправки.
- Новый запуск или новый статус отменяет прежний таймер, поэтому старое событие не скрывает свежий прогресс или ошибку.
- Результат завершённой отправки сохраняется после сброса галки.

Разрешения и правила сбора данных не изменились.

## Data declaration

Use the categories already declared in `manifest.json`:

- Browsing activity — required;
- Website content — required;
- Personally identifying information — required because configured sender and recipient email addresses pass through Native Messaging;
- Authentication information — not collected by the extension because the SMTP password is entered only in the Windows app.

The extension does not collect data for the developer. Native Messaging transfers user-selected content and configured email addresses to the locally installed TabTome app so the user-requested EPUB can be built and sent.

## Screenshot order and localized captions

1. `outputs/amo-screenshots-v0.11.0/01-tabs-1280x800.png`
   - EN: **Select one or several open tabs and send them as one EPUB.**
   - RU: **Выберите одну или несколько открытых вкладок и отправьте их одним EPUB.**
2. `outputs/amo-screenshots-v0.11.0/02-text-1280x800.png`
   - EN: **Paste formatted text and images, then send them from the same popup.**
   - RU: **Вставьте форматированный текст и изображения и отправьте их из того же окна.**
3. `outputs/amo-screenshots-v0.11.0/03-settings-1280x800.png`
   - EN: **Choose a language and configure Kindle or PocketBook delivery. The SMTP password stays in the Windows app.**
   - RU: **Выберите язык и настройте доставку на Kindle или PocketBook. SMTP-пароль остаётся в приложении Windows.**

## Submission checklist

1. Choose **On this site / Listed** and Firefox only.
2. Upload `outputs/1-TABTOME-FIREFOX-ADDON-v0.11.1.zip` as the add-on.
3. Answer **Yes** to the generated/bundled source-code question.
4. Upload `outputs/2-TABTOME-SOURCE-CODE-v0.11.1.zip` as source code.
5. Paste `docs/releases/AMO_REVIEW_NOTES_v0.11.1.md` into Notes for Reviewers.
6. Select Windows only; do not select Android, Linux, or macOS.
7. Select MPL-2.0 and add `https://tab-tome.netlify.app/en/privacy/`.
8. Add the homepage and support URLs from Basic information.
9. Upload the three screenshots in the order above.
10. Do not submit the Chrome ZIP, project ZIP, Windows installer, or SMTP credentials to AMO.
