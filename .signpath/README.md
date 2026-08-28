# SignPath artifact configurations

These XML files are the version-controlled source for the two SignPath artifact configurations used by `.github/workflows/windows-signpath.yml`.

- `binaries-artifact-configuration.xml` signs the native messaging host and settings application before Inno Setup packages them.
- `installer-artifact-configuration.xml` signs the final Inno Setup executable.

Create two custom artifact configurations in the SignPath project, paste the respective XML, and store their slugs in the repository variables documented in `docs/SIGNPATH_SETUP.md`. The GitHub artifact wrapper is a ZIP, so both configurations intentionally use `<zip-file>` as their root file element.

Do not add a local certificate, PFX file, private key, or API token to this directory.
