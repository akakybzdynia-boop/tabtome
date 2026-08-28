# SignPath setup for Windows releases

This document prepares the integration; it does not create a SignPath account, submit the open-source application, publish the repository, or sign a release by itself.

## 1. Preconditions

- The repository is public and accessible without signing in.
- The project has an OSI-approved license, release documentation, privacy policy, and an active maintainer.
- GitHub account MFA and SignPath account MFA are enabled.
- Normal Windows CI passes on the exact commit intended for release.
- The version in `server/package.json`, `installer/TabTome.iss`, and the C# assembly metadata agrees.

Apply for SignPath Foundation open-source code signing using the project repository and [CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md). Do not claim that releases are signed before the application is approved and the first real signed build has been verified.

## 2. Create the SignPath project

After approval:

1. Create or use a SignPath project with slug such as `tabtome`.
2. Configure GitHub Actions as the trusted build system and connect the repository.
3. Enable origin verification for this repository and the manual signing workflow.
4. Create a release signing policy. Manual approval is acceptable for the current single-maintainer project; do not enable an unrestricted policy that can sign arbitrary uploads.
5. Create two custom artifact configurations by pasting:
   - `.signpath/binaries-artifact-configuration.xml`;
   - `.signpath/installer-artifact-configuration.xml`.
6. Record the organization ID, project slug, signing-policy slug, and both artifact-configuration slugs.

The two requests are deliberate. Inno Setup is compiled only after the inner application EXEs have been signed. The resulting outer installer is then signed in a second request. The current workflow does not sign Inno Setup's generated uninstaller; this limitation must not be concealed in release documentation.

## 3. Configure GitHub

In repository **Settings → Secrets and variables → Actions**, add:

Secret:

| Name | Value |
| --- | --- |
| `SIGNPATH_API_TOKEN` | SignPath token for a submitter restricted to this project and policy |

Repository variables:

| Name | Value |
| --- | --- |
| `SIGNPATH_ORGANIZATION_ID` | SignPath organization ID |
| `SIGNPATH_PROJECT_SLUG` | project slug |
| `SIGNPATH_SIGNING_POLICY_SLUG` | release signing-policy slug |
| `SIGNPATH_BINARIES_ARTIFACT_CONFIGURATION_SLUG` | slug created from `binaries-artifact-configuration.xml` |
| `SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG` | slug created from `installer-artifact-configuration.xml` |

Do not store a PFX, certificate private key, SMTP password, or user data in GitHub secrets. The SignPath token must not be written to logs or local configuration.

## 4. Run a signed release candidate

For application version `0.11.1`:

1. Confirm that normal `Windows CI` passed for the intended commit.
2. Create and push the exact tag `windows-v0.11.1`.
3. In GitHub Actions open **Windows SignPath release candidate**.
4. Select the `windows-v0.11.1` tag, then use **Run workflow**.
5. Approve both signing requests in SignPath if the policy requires approval.
6. Download the `tabtome-signed-*` GitHub Actions artifact.
7. Independently verify Authenticode status and compare SHA-256.
8. Test install, settings, Firefox Native Messaging, a real EPUB delivery, update over the previous version, and uninstall on a clean Windows user/profile.

The workflow intentionally rejects branches and mismatched tags. It uploads a release candidate only as a time-limited Actions artifact. It does not create a GitHub Release, publish a website, push commits, or upload anything to AMO.

## 5. Publish only after verification

When the signed candidate has passed the release checklist, manually create the GitHub Release and attach the exact verified installer plus its checksum. Do not rebuild between verification and publication. Keep the workflow run URL and SignPath signing-request URLs as release evidence.

Official references:

- [SignPath open-source code signing](https://signpath.org/)
- [SignPath GitHub Actions integration](https://docs.signpath.io/trusted-build-systems/github)
- [SignPath artifact configuration syntax](https://docs.signpath.io/artifact-configuration/syntax)
