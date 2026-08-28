# Windows installer

Установщик приложения TabTome собирается Inno Setup и предназначен для 64-разрядной Windows 10 1809 или новее. Он не требует прав администратора и не устанавливает системный сервис.

## Установленная структура

```text
%LOCALAPPDATA%\Programs\TabTome
├── TabTomeSettings.exe
├── LICENSE
├── THIRD-PARTY-NOTICES.txt
├── runtime\node.exe
├── host\TabTomeHost.exe
├── host\manifest.json
├── host\node-path.txt
├── host\data-root.txt
└── server\dist + production node_modules

%LOCALAPPDATA%\PageToEreaderLocal
├── .env
├── .smtp-pass
├── data\settings.json
├── data\jobs
└── logs
```

Разделение обязательно: обновление может полностью заменить каталог программы, не затрагивая SMTP-пароль, настройки и журнал дедупликации.

Путь `%LOCALAPPDATA%\PageToEreaderLocal` и технические ID Native Messaging сохраняют прежнее имя намеренно: это позволяет обновить существующую установку без потери адресов, DPAPI-пароля и связи с подписанным расширением. Inno Setup использует прежний `AppId`, поэтому обновление может сохранить старый каталог программы; чистая установка использует `%LOCALAPPDATA%\Programs\TabTome`.

Firefox запускает `TabTomeHost.exe` по требованию. Launcher читает только абсолютные пути из `node-path.txt` и `data-root.txt`, запускает встроенный Node.js без консольного окна и передаёт Native Messaging stdio. Фоновый процесс между запросами не работает.

## Первая установка и миграция

Установщик регистрирует для текущего пользователя:

```text
HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\page_to_ereader_local
```

Если ключ уже указывает на ручную установку из папки проекта, до замены регистрации переносятся только отсутствующие пользовательские файлы:

- `server\.env`;
- `server\.smtp-pass`;
- `server\data\settings.json`.

Исходные файлы не удаляются. Задания и журналы старой разработки не переносятся.

`TabTomeSettings.exe` сохраняет адреса и SMTP-параметры, передаёт введённый пароль встроенному Windows PowerShell только через окружение дочернего процесса, выполняет DPAPI round-trip и пишет только зашифрованный `.smtp-pass`. Затем программа может запустить `diagnose.js` через встроенный Node.js.

## Воспроизводимая сборка

Закреплены:

- Node.js 24.18.1 x64 LTS;
- Inno Setup 6.7.3;
- production-зависимости в `installer/runtime/package-lock.json`.

Сборка использует отдельный кэш `work\npm-cache`, поэтому не зависит от прав доступа и состояния глобального npm-кэша пользователя. Каталог исключён из Git и релизных архивов.

Подготовка инструментов:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\prepare-build-tools.ps1
```

Скрипт сверяет Node.js ZIP с официальным `SHASUMS256.txt` и проверяет Authenticode-подпись установщика Inno Setup с издателем `Pyrsys B.V.`.

Сборка:

```powershell
npm.cmd run build:installer
```

Результат:

```text
outputs\TabTome-Setup-0.11.1.exe
outputs\TabTome-Setup-0.11.1.exe.sha256
```

`build-installer.ps1` подготавливает staging-каталог и вызывает `compile-installer.ps1`. Разделение нужно для облачной подписи: после первой сборки SignPath подписывает `TabTomeHost.exe` и `TabTomeSettings.exe`, скрипт `install-signed-binaries.ps1` возвращает их в staging-каталог, а `compile-installer.ps1` собирает вокруг них итоговый установщик. Затем сам установщик подписывается отдельным запросом.

Изолированный тест устанавливает приложение во временный каталог и временно подменяет регистрацию Native Messaging. В `finally` прежнее значение реестра восстанавливается:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\test-installer.ps1
```

Проверяются перенос старых настроек, встроенный runtime, абсолютные пути manifest, чистый протокол launcher и полное удаление каталога программы.

## Authenticode и SignPath

Локальная команда по-прежнему создаёт неподписанный EXE: она предназначена для разработки и проверки. Windows SmartScreen может показать предупреждение «Неизвестный издатель».

Для официального релиза подготовлен ручной GitHub Actions workflow `.github/workflows/windows-signpath.yml`. Он принимает только тег `windows-v<версия приложения>`, выполняет чистую сборку и тесты, дважды обращается к SignPath (внутренние EXE, затем внешний установщик), проверяет Authenticode и только после этого вычисляет SHA-256. Workflow не создаёт GitHub Release.

Настройка: `docs/SIGNPATH_SETUP.md`. Политика: `CODE_SIGNING_POLICY.md`. Пока заявка SignPath не одобрена и реальный workflow не завершился со статусом `Valid`, установщик нельзя описывать как подписанный.

Ограничение текущей схемы: отдельно сгенерированный Inno Setup uninstaller не подписывается. Подписываются два исполняемых файла приложения и внешний EXE установщика.
