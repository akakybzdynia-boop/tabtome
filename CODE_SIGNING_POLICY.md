# Code signing policy

This policy covers Authenticode signatures for official TabTome Windows releases.

## Scope

Only these project-built PE files may be signed:

- `TabTomeHost.exe`;
- `TabTomeSettings.exe`;
- `TabTome-Setup-<version>.exe`.

Development builds, browser-extension archives, source archives, third-party binaries, and arbitrary files are outside the signing scope. A signature identifies the publisher and protects file integrity; it does not replace source review, malware scanning, or functional testing.

## Roles

- Committer and release maintainer: `@akakybzdynia-boop`.
- Signing submitter and approver: the same maintainer while this remains a single-maintainer project.
- SignPath manages the private signing key and certificate. The project does not export or store the private key.

If additional maintainers are added, signing approval should be separated from the person who prepared the release whenever SignPath account roles permit it.

## Authorized build and release process

1. Release source is committed to the public GitHub repository.
2. The normal Windows CI workflow builds and tests the source on a GitHub-hosted Windows runner.
3. The maintainer creates a tag named `windows-v<application-version>`, for example `windows-v0.11.1`.
4. The manual `Windows SignPath release candidate` workflow is started from that exact tag.
5. The workflow rebuilds from a clean checkout, runs the complete project test suite, and prepares the installer stage using pinned Node.js and Inno Setup versions.
6. SignPath signs the native host and settings application from the GitHub Actions artifact.
7. The workflow puts those signed files into the installer stage, compiles the outer installer, and submits that installer to SignPath separately.
8. Authenticode signatures are verified before the isolated install/uninstall test and before release archives are uploaded as GitHub Actions artifacts.
9. Publishing a GitHub Release remains a separate manual decision. The signing workflow does not publish a release or modify repository contents.

SignPath signing is restricted by version-controlled artifact configurations under `.signpath/`. Repository secrets contain only the SignPath API token; they do not contain a certificate or private key.

## Version and metadata controls

- The application version comes from `server/package.json`.
- The signing tag must match `windows-v<application-version>`.
- The artifact configurations require the expected file paths, product name, company name, product version, and four-part file version.
- SHA-256 files are generated only after the final signed installer has been downloaded and verified.

## Compromise or misuse response

If a GitHub, SignPath, or maintainer account may be compromised, signing stops immediately. The maintainer must revoke affected API tokens and sessions, contact SignPath to suspend or revoke the certificate when appropriate, remove untrusted artifacts from distribution, disclose the affected versions, and publish replacement builds only after the build origin is trusted again.

Signing failures must not be bypassed by publishing an unsigned file under the same release filename. An intentionally unsigned development build must be labeled as such and kept outside official release downloads.

## User verification

Users can inspect a downloaded installer in PowerShell:

```powershell
Get-AuthenticodeSignature .\TabTome-Setup-0.11.1.exe | Format-List Status,StatusMessage,SignerCertificate
Get-FileHash -Algorithm SHA256 .\TabTome-Setup-0.11.1.exe
```

For an official signed release, Authenticode status must be `Valid`, and the SHA-256 value must match the checksum published with that exact release.

## Privacy

Code signing does not send user page content, SMTP credentials, EPUB files, or application settings to SignPath. SignPath receives only build artifacts and build/repository metadata used to verify and sign a release. The product privacy policies are available in [English](landing/en/privacy/index.html) and [Russian](landing/ru/privacy/index.html).

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by SignPath Foundation.

## Current status

The build integration and policy are prepared, but no artifact should be described as Authenticode-signed until the SignPath open-source application is approved and a completed workflow run verifies the resulting signatures.
