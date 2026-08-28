import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const ci = read(".github/workflows/windows-ci.yml");
const signing = read(".github/workflows/windows-signpath.yml");
const binariesConfig = read(".signpath/binaries-artifact-configuration.xml");
const installerConfig = read(".signpath/installer-artifact-configuration.xml");
const policy = read("CODE_SIGNING_POLICY.md");
const buildInstaller = read("installer/build-installer.ps1");
const packageRelease = read("scripts/package-release.ps1");
const serverPackage = JSON.parse(read("server/package.json"));
const innoSetup = read("installer/TabTome.iss");
const launcher = read("host/launcher.cs");
const settings = read("host/settings.cs");
const applicationVersion = serverPackage.version;
const fileVersion = `${applicationVersion}.0`;

for (const workflow of [ci, signing]) {
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release|gh\s+release\s+create/i);
}

assert.match(ci, /windows-2025/);
assert.match(ci, /npm\.cmd test/);
assert.match(ci, /test-installer\.ps1/);
assert.match(ci, /package-release\.ps1 -SkipInstaller/);

assert.match(signing, /workflow_dispatch/);
assert.match(signing, /permissions:\s*[\s\S]*actions:\s*read[\s\S]*contents:\s*read/);
assert.equal((signing.match(/signpath\/github-action-submit-signing-request@v2/g) ?? []).length, 2);
assert.match(signing, /github\.ref_type/);
assert.match(signing, /windows-v\$version/);
assert.match(signing, /SIGNPATH_API_TOKEN/);
assert.match(signing, /SIGNPATH_BINARIES_ARTIFACT_CONFIGURATION_SLUG/);
assert.match(signing, /SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG/);
assert.match(signing, /install-signed-binaries\.ps1/);
assert.match(signing, /install-signed-installer\.ps1/);

for (const config of [binariesConfig, installerConfig]) {
  assert.match(config, /artifact-configuration\/v1/);
  assert.match(config, /<zip-file>/);
  assert.match(config, /<authenticode-sign/);
  assert.match(config, /product-name="TabTome"/);
  assert.match(config, /file-version="\$\{fileVersion\}"/);
}
assert.match(binariesConfig, /product-version="\$\{fileVersion\}"/);
assert.match(installerConfig, /product-version="\$\{version\}"/);
assert.match(binariesConfig, /TabTomeSettings\.exe/);
assert.match(binariesConfig, /host\/TabTomeHost\.exe/);
assert.match(installerConfig, /TabTome-Setup-\$\{version\}\.exe/);

assert.match(policy, /Free code signing provided by \[SignPath\.io\]/);
assert.match(policy, /certificate by SignPath Foundation/);
assert.match(policy, /windows-v<application-version>/);
assert.match(buildInstaller, /compile-installer\.ps1/);
assert.match(buildInstaller, /work\\npm-cache/);
assert.match(packageRelease, /CODE_SIGNING_POLICY\.md/);
assert.match(packageRelease, /Get-TreeEntries \(Join-Path \$root "\.github"\)/);
assert.match(packageRelease, /Get-TreeEntries \(Join-Path \$root "\.signpath"\)/);
assert.match(innoSetup, new RegExp(`#define MyAppVersion "${applicationVersion.replaceAll(".", "\\.")}"`));
assert.match(innoSetup, new RegExp(`VersionInfoVersion=${fileVersion.replaceAll(".", "\\.")}`));
for (const source of [launcher, settings]) {
  assert.match(source, new RegExp(`AssemblyVersion\\("${fileVersion.replaceAll(".", "\\.")}\"\\)`));
  assert.match(source, new RegExp(`AssemblyFileVersion\\("${fileVersion.replaceAll(".", "\\.")}\"\\)`));
}

console.log("Windows CI and SignPath signing contracts: OK");
