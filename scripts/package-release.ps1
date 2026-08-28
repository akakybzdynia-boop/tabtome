param(
    [switch] $SkipInstaller
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputs = Join-Path $root "outputs"
$extension = Join-Path $root "extension"
$extensionPackage = Get-Content -Raw -LiteralPath (Join-Path $extension "package.json") | ConvertFrom-Json
$nativePackage = Get-Content -Raw -LiteralPath (Join-Path $root "server\package.json") | ConvertFrom-Json
$version = [string]$extensionPackage.version
$nativeVersion = [string]$nativePackage.version
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$repro = Join-Path $temporaryRoot "tabtome-source-repro-$version-$PID"
$npmCache = Join-Path $root "work\npm-cache"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $outputs | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null

function New-ReleaseZip {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [array] $Entries
    )
    $resolvedOutputs = [System.IO.Path]::GetFullPath($outputs) + [System.IO.Path]::DirectorySeparatorChar
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedOutputs, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Archive path is outside outputs: $resolvedPath"
    }
    if (Test-Path -LiteralPath $resolvedPath) { Remove-Item -LiteralPath $resolvedPath -Force }
    $stream = [System.IO.File]::Open($resolvedPath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        try {
            foreach ($item in $Entries | Sort-Object Destination) {
                $destination = ([string]$item.Destination).Replace("\", "/").TrimStart("/")
                if (-not $destination -or $destination.Contains("..") -or $destination.Contains("\")) {
                    throw "Unsafe archive entry: $destination"
                }
                $entry = $archive.CreateEntry($destination, [System.IO.Compression.CompressionLevel]::Optimal)
                $entryStream = $entry.Open()
                $sourceStream = [System.IO.File]::OpenRead([string]$item.Source)
                try { $sourceStream.CopyTo($entryStream) }
                finally { $sourceStream.Dispose(); $entryStream.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
}

function Get-TreeEntries {
    param([string] $Directory, [string] $Prefix = "")
    $base = [System.IO.Path]::GetFullPath($Directory)
    Get-ChildItem -LiteralPath $base -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($base.Length).TrimStart("\", "/").Replace("\", "/")
        if ($relative -notmatch '(^|/)\.netlify(/|$)') {
            [pscustomobject]@{ Source = $_.FullName; Destination = ($Prefix.TrimEnd("/") + "/" + $relative).TrimStart("/") }
        }
    }
}

& npm.cmd run build -w extension
if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }
& npm.cmd run build -w server
if ($LASTEXITCODE -ne 0) { throw "Native component build failed." }

$addonEntries = @(Get-TreeEntries (Join-Path $extension "dist"))
$addonPrimary = Join-Path $outputs "1-TABTOME-FIREFOX-ADDON-v$version.zip"
New-ReleaseZip $addonPrimary $addonEntries

$chromeEntries = @(Get-TreeEntries (Join-Path $extension "dist-chrome"))
$chromePrimary = Join-Path $outputs "1-TABTOME-CHROME-ADDON-v$version.zip"
New-ReleaseZip $chromePrimary $chromeEntries

$resolvedRepro = [System.IO.Path]::GetFullPath($repro)
$resolvedTemporaryRoot = $temporaryRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedRepro.StartsWith($resolvedTemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe reproduction directory." }
if (Test-Path -LiteralPath $resolvedRepro) { Remove-Item -LiteralPath $resolvedRepro -Recurse -Force }
New-Item -ItemType Directory -Path $resolvedRepro | Out-Null

$flatSourceFiles = @(
    "README-SOURCE.md", "READABILITY-LICENSE.txt", "build.mjs", "manifest.json", "manifest.chrome.json", "package.json", "package-lock.json",
    "src\background.ts", "src\content.ts", "src\i18n.ts", "src\options.css", "src\options.html", "src\options.ts",
    "src\popup.css", "src\popup.html", "src\popup.ts",
    "icons\icon.svg", "icons\icon-16.png", "icons\icon-32.png", "icons\icon-48.png", "icons\icon-64.png", "icons\icon-96.png", "icons\icon-128.png"
)
foreach ($relative in $flatSourceFiles) {
    Copy-Item -LiteralPath (Join-Path $extension $relative) -Destination (Join-Path $resolvedRepro (Split-Path $relative -Leaf))
}
Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination (Join-Path $resolvedRepro "LICENSE")
Copy-Item -LiteralPath (Join-Path $extension "_locales\en\messages.json") -Destination (Join-Path $resolvedRepro "messages.en.json")
Copy-Item -LiteralPath (Join-Path $extension "_locales\ru\messages.json") -Destination (Join-Path $resolvedRepro "messages.ru.json")
Push-Location $resolvedRepro
try {
    & npm.cmd ci --ignore-scripts --fund=false --audit=false --cache $npmCache
    if ($LASTEXITCODE -ne 0) { throw "Flat source dependencies cannot be installed from package-lock.json." }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Flat source archive cannot reproduce the extension." }
} finally { Pop-Location }

$expected = @(Get-TreeEntries (Join-Path $extension "dist"))
$actual = @(Get-TreeEntries (Join-Path $resolvedRepro "dist"))
if ($expected.Count -ne $actual.Count) { throw "Reproduced extension file count differs." }
foreach ($item in $expected) {
    $relative = $item.Destination
    $candidate = Join-Path (Join-Path $resolvedRepro "dist") $relative
    if (-not (Test-Path -LiteralPath $candidate) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $item.Source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash) {
        throw "Reproduced file differs: $relative"
    }
}

$expectedChrome = @(Get-TreeEntries (Join-Path $extension "dist-chrome"))
$actualChrome = @(Get-TreeEntries (Join-Path $resolvedRepro "dist-chrome"))
if ($expectedChrome.Count -ne $actualChrome.Count) { throw "Reproduced Chrome extension file count differs." }
foreach ($item in $expectedChrome) {
    $relative = $item.Destination
    $candidate = Join-Path (Join-Path $resolvedRepro "dist-chrome") $relative
    if (-not (Test-Path -LiteralPath $candidate) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $item.Source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash) {
        throw "Reproduced Chrome file differs: $relative"
    }
}

$sourceEntries = Get-ChildItem -LiteralPath $resolvedRepro -File | ForEach-Object {
    [pscustomobject]@{ Source = $_.FullName; Destination = $_.Name }
}
$sourcePrimary = Join-Path $outputs "2-TABTOME-SOURCE-CODE-v$version.zip"
New-ReleaseZip $sourcePrimary $sourceEntries
$sourceArchive = [System.IO.Compression.ZipFile]::OpenRead($sourcePrimary)
try {
    $sourceNames = @($sourceArchive.Entries | ForEach-Object FullName)
    if ($sourceNames -notcontains "package-lock.json" -or $sourceNames -notcontains "package.json" -or
        $sourceNames -notcontains "README-SOURCE.md" -or $sourceNames -notcontains "LICENSE" -or
        $sourceNames -notcontains "READABILITY-LICENSE.txt") {
        throw "Source archive is missing its lockfile, license or build instructions."
    }
    if ($sourceNames | Where-Object { $_.Contains("\") -or $_ -match '(^|/)node_modules/' -or $_ -match '(^|/)dist(-chrome)?/' }) {
        throw "Source archive contains generated dependencies or build output."
    }
} finally { $sourceArchive.Dispose() }

$fullEntries = @()
foreach ($name in @(
    ".gitignore", "LICENSE", "README.md", "README.en.md", "PRODUCT.md", "SECURITY.md", "CODE_SIGNING_POLICY.md", "CODE_SIGNING_POLICY.ru.md", "package.json", "package-lock.json",
    "build-native-launcher.ps1", "build-settings-tool.ps1", "install-native-host.ps1", "migrate-from-http.ps1", "protect-smtp-password.ps1",
    "run-diagnostics.ps1", "test-firefox-native-load.ps1", "test-firefox-popup.ps1", "uninstall-native-host.ps1", "update-project.ps1"
)) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root $name); Destination = $name }
}
$fullEntries += Get-TreeEntries (Join-Path $root "docs") "docs"
$fullEntries += Get-TreeEntries (Join-Path $root "landing") "landing"
$fullEntries += Get-TreeEntries (Join-Path $root "design\amo-screenshots") "design/amo-screenshots"
$fullEntries += Get-TreeEntries (Join-Path $root "scripts") "scripts"
$fullEntries += Get-TreeEntries (Join-Path $extension "src") "extension/src"
$fullEntries += Get-TreeEntries (Join-Path $extension "_locales") "extension/_locales"
$fullEntries += Get-TreeEntries (Join-Path $extension "icons") "extension/icons"
$fullEntries += Get-TreeEntries (Join-Path $extension "dist") "extension/dist"
$fullEntries += Get-TreeEntries (Join-Path $extension "dist-chrome") "extension/dist-chrome"
foreach ($name in @("README-SOURCE.md", "READABILITY-LICENSE.txt", "build.mjs", "manifest.json", "manifest.chrome.json", "package.json", "package-lock.json")) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $extension $name); Destination = "extension/$name" }
}
foreach ($name in @("launcher.cs", "settings.cs")) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root "host\$name"); Destination = "host/$name" }
}
$fullEntries += Get-TreeEntries (Join-Path $root ".github") ".github"
$fullEntries += Get-TreeEntries (Join-Path $root ".signpath") ".signpath"
$installerSourceFiles = @(
    "TabTome.iss", "build-installer.ps1", "compile-installer.ps1", "install-signed-binaries.ps1",
    "install-signed-installer.ps1", "prepare-build-tools.ps1", "test-installer.ps1", "verify-authenticode.ps1",
    "INSTALLED-README.txt", "THIRD-PARTY-NOTICES.txt", "runtime\package.json", "runtime\package-lock.json"
)
foreach ($name in $installerSourceFiles) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root "installer\$name"); Destination = ("installer/" + $name.Replace("\", "/")) }
}
$fullEntries += Get-TreeEntries (Join-Path $root "server\src") "server/src"
$fullEntries += Get-TreeEntries (Join-Path $root "server\dist") "server/dist"
foreach ($name in @(".env.example", "package.json", "tsconfig.json")) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root "server\$name"); Destination = "server/$name" }
}
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\PROJECT_STATUS_RU.md"); Destination = "PROJECT_STATUS_RU.md" }
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\releases\v$version.md"); Destination = "RELEASE_NOTES_v$version.md" }
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\releases\AMO_REVIEW_NOTES_v$version.md"); Destination = "AMO_REVIEW_NOTES_v$version.md" }
$fullPrimary = Join-Path $outputs "TabTome-Project-v$version.zip"
New-ReleaseZip $fullPrimary $fullEntries

$installerPrimary = Join-Path $outputs "TabTome-Setup-$nativeVersion.exe"
if (-not $SkipInstaller) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "installer\build-installer.ps1") -SkipTests
    if ($LASTEXITCODE -ne 0) { throw "Windows installer build failed." }
    if (-not (Test-Path -LiteralPath $installerPrimary -PathType Leaf)) { throw "Windows installer output is missing." }
}

$aliases = @{
    $addonPrimary = @("TabTome-Firefox-v$version.zip", "TabTome-Firefox.zip")
    $chromePrimary = @("TabTome-Chrome-v$version.zip", "TabTome-Chrome.zip")
    $sourcePrimary = @("TabTome-Source-v$version.zip", "TabTome-Source.zip")
    $fullPrimary = @("TabTome-Project.zip")
}
if (Test-Path -LiteralPath $installerPrimary -PathType Leaf) { $aliases[$installerPrimary] = @("TabTome-Setup.exe") }
foreach ($source in $aliases.Keys) {
    foreach ($name in $aliases[$source]) { Copy-Item -LiteralPath $source -Destination (Join-Path $outputs $name) -Force }
}

$releaseFiles = @($addonPrimary, $chromePrimary, $sourcePrimary, $fullPrimary)
if (Test-Path -LiteralPath $installerPrimary -PathType Leaf) { $releaseFiles += $installerPrimary }
$screenshotDirectory = Join-Path $outputs "amo-screenshots-v$version"
if (Test-Path -LiteralPath $screenshotDirectory -PathType Container) {
    $releaseFiles += Get-ChildItem -LiteralPath $screenshotDirectory -File -Filter "*.png" | Sort-Object Name | ForEach-Object FullName
}
$hashLines = $releaseFiles | ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    "$($hash.Hash.ToLowerInvariant())  $(Split-Path $_ -Leaf)"
}
[System.IO.File]::WriteAllLines((Join-Path $outputs "SHA256SUMS-v$version.txt"), $hashLines, (New-Object System.Text.UTF8Encoding($false)))

$addon = [System.IO.Compression.ZipFile]::OpenRead($addonPrimary)
try {
    $names = @($addon.Entries | ForEach-Object FullName)
    if ($names -contains "src/background.ts" -or ($names | Where-Object { $_.Contains("\") -or $_ -match '(^|/)node_modules/' })) { throw "Invalid add-on archive entries." }
    if ($names -notcontains "manifest.json" -or $names -notcontains "background.js") { throw "Add-on archive root is invalid." }
} finally { $addon.Dispose() }

$chromeAddon = [System.IO.Compression.ZipFile]::OpenRead($chromePrimary)
try {
    $names = @($chromeAddon.Entries | ForEach-Object FullName)
    if ($names -contains "src/background.ts" -or ($names | Where-Object { $_.Contains("\") -or $_ -match '(^|/)node_modules/' })) { throw "Invalid Chrome archive entries." }
    if ($names -notcontains "manifest.json" -or $names -notcontains "background.js") { throw "Chrome archive root is invalid." }
    $chromeManifestEntry = $chromeAddon.GetEntry("manifest.json")
    $reader = New-Object System.IO.StreamReader($chromeManifestEntry.Open())
    try { $chromeManifest = $reader.ReadToEnd() | ConvertFrom-Json }
    finally { $reader.Dispose() }
    if ($chromeManifest.background.service_worker -ne "background.js" -or $chromeManifest.background.scripts) { throw "Chrome archive has the wrong background configuration." }
} finally { $chromeAddon.Dispose() }

if (Test-Path -LiteralPath $resolvedRepro) { Remove-Item -LiteralPath $resolvedRepro -Recurse -Force }

Write-Host "Release archives ${version}: OK"
Get-Item -LiteralPath $releaseFiles | Select-Object Name, Length
Get-Content -LiteralPath (Join-Path $outputs "SHA256SUMS-v$version.txt")
