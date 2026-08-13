$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputs = Join-Path $root "outputs"
$extension = Join-Path $root "extension"
$repro = Join-Path $root "work\source-repro-0.8.0"
$version = "0.8.0"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $outputs | Out-Null

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
        [pscustomobject]@{ Source = $_.FullName; Destination = ($Prefix.TrimEnd("/") + "/" + $relative).TrimStart("/") }
    }
}

& npm.cmd run build -w extension
if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }
& npm.cmd run build -w server
if ($LASTEXITCODE -ne 0) { throw "Native component build failed." }

$addonEntries = @(Get-TreeEntries (Join-Path $extension "dist"))
$addonPrimary = Join-Path $outputs "1-FIRST-UPLOAD-ADDON-v$version.zip"
New-ReleaseZip $addonPrimary $addonEntries

$resolvedRepro = [System.IO.Path]::GetFullPath($repro)
$resolvedWork = [System.IO.Path]::GetFullPath((Join-Path $root "work")) + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedRepro.StartsWith($resolvedWork, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe reproduction directory." }
if (Test-Path -LiteralPath $resolvedRepro) { Remove-Item -LiteralPath $resolvedRepro -Recurse -Force }
New-Item -ItemType Directory -Path $resolvedRepro | Out-Null

$flatSourceFiles = @(
    "README-SOURCE.md", "build.mjs", "manifest.json", "package.json",
    "src\background.ts", "src\content.ts", "src\options.css", "src\options.html", "src\options.ts",
    "src\popup.css", "src\popup.html", "src\popup.ts",
    "icons\icon.svg", "icons\icon-16.png", "icons\icon-32.png", "icons\icon-48.png", "icons\icon-64.png", "icons\icon-96.png"
)
foreach ($relative in $flatSourceFiles) {
    Copy-Item -LiteralPath (Join-Path $extension $relative) -Destination (Join-Path $resolvedRepro (Split-Path $relative -Leaf))
}
Push-Location $resolvedRepro
try {
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

$sourceEntries = Get-ChildItem -LiteralPath $resolvedRepro -File | ForEach-Object {
    [pscustomobject]@{ Source = $_.FullName; Destination = $_.Name }
}
$sourcePrimary = Join-Path $outputs "2-SOURCE-CODE-ONLY-v$version.zip"
New-ReleaseZip $sourcePrimary $sourceEntries

$fullEntries = @()
foreach ($name in @(
    ".gitignore", "README.md", "SECURITY.md", "package.json", "package-lock.json",
    "build-native-launcher.ps1", "install-native-host.ps1", "migrate-from-http.ps1", "protect-smtp-password.ps1",
    "run-diagnostics.ps1", "test-firefox-native-load.ps1", "test-firefox-popup.ps1", "uninstall-native-host.ps1", "update-project.ps1"
)) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root $name); Destination = $name }
}
$fullEntries += Get-TreeEntries (Join-Path $root "docs") "docs"
$fullEntries += Get-TreeEntries (Join-Path $root "scripts") "scripts"
$fullEntries += Get-TreeEntries (Join-Path $extension "src") "extension/src"
$fullEntries += Get-TreeEntries (Join-Path $extension "icons") "extension/icons"
$fullEntries += Get-TreeEntries (Join-Path $extension "dist") "extension/dist"
foreach ($name in @("README-SOURCE.md", "build.mjs", "manifest.json", "package.json")) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $extension $name); Destination = "extension/$name" }
}
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "host\launcher.cs"); Destination = "host/launcher.cs" }
$fullEntries += Get-TreeEntries (Join-Path $root "server\src") "server/src"
$fullEntries += Get-TreeEntries (Join-Path $root "server\dist") "server/dist"
foreach ($name in @(".env.example", "package.json", "tsconfig.json")) {
    $fullEntries += [pscustomobject]@{ Source = (Join-Path $root "server\$name"); Destination = "server/$name" }
}
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\PROJECT_STATUS_RU.md"); Destination = "PROJECT_STATUS_RU.md" }
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\releases\v0.8.0.md"); Destination = "RELEASE_NOTES_v0.8.0.md" }
$fullEntries += [pscustomobject]@{ Source = (Join-Path $root "docs\releases\AMO_REVIEW_NOTES_v0.8.0.md"); Destination = "AMO_REVIEW_NOTES_v0.8.0.md" }
$fullPrimary = Join-Path $outputs "LOCAL-COMPONENT-AND-PROJECT-v$version.zip"
New-ReleaseZip $fullPrimary $fullEntries

$aliases = @{
    $addonPrimary = @("page-to-ereader-addon-v$version.zip", "page-to-ereader-addon.zip")
    $sourcePrimary = @("page-to-ereader-source-v$version.zip", "page-to-ereader-source.zip")
    $fullPrimary = @("firefox-to-kindle-local-v$version.zip", "firefox-to-kindle-mvp.zip")
}
foreach ($source in $aliases.Keys) {
    foreach ($name in $aliases[$source]) { Copy-Item -LiteralPath $source -Destination (Join-Path $outputs $name) -Force }
}

$releaseFiles = @($addonPrimary, $sourcePrimary, $fullPrimary)
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

Write-Host "Release archives ${version}: OK"
Get-Item -LiteralPath $releaseFiles | Select-Object Name, Length
Get-Content -LiteralPath (Join-Path $outputs "SHA256SUMS-v$version.txt")
