TabTome 0.11.1
================================

This is the Windows app for the TabTome Firefox extension. It sends EPUB files to configured Kindle or PocketBook addresses.
It is started by Firefox only when the extension checks settings or sends a book.
It does not listen on a network port and does not run continuously in the background.

Application files:
  %LOCALAPPDATA%\Programs\TabTome

Settings, encrypted SMTP password, jobs and logs:
  %LOCALAPPDATA%\PageToEreaderLocal

Use the Start menu shortcut "TabTome" to change SMTP settings or run diagnostics.
The SMTP password is encrypted for the current Windows user with Windows DPAPI.

Firefox Native Messaging registration:
  HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\page_to_ereader_local

Uninstalling the application removes its program files and Firefox registration. The uninstaller asks separately whether user settings and logs should also be removed.

Project source code license:
  Mozilla Public License 2.0. See LICENSE in the application directory.

Source code:
  https://github.com/akakybzdynia-boop/page-to-ereader-local

Bundled third-party components remain under the licenses listed in THIRD-PARTY-NOTICES.txt and their package license files.
