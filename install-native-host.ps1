$ErrorActionPreference = "Stop"

$hostName = "page_to_ereader_local"
$projectRoot = $PSScriptRoot
$hostDirectory = Join-Path $projectRoot "host"
$hostLauncher = Join-Path $hostDirectory "TabTomeHost.exe"
$launcherBuilder = Join-Path $projectRoot "build-native-launcher.ps1"
$hostManifest = Join-Path $hostDirectory "manifest.json"
$entryPoint = Join-Path $projectRoot "server\dist\native-host.js"
$environmentFile = Join-Path $projectRoot "server\.env"
$registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$hostName"
$chromeRegistryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName"
)
$obsoleteSourceFiles = @(
    "server\src\app.ts",
    "server\src\app.test.ts",
    "server\src\auth.ts",
    "server\src\auth.test.ts",
    "server\src\index.ts"
)

Write-Host "Installing TabTome native host..."

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or is not available in PATH."
}
if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
    throw "Create and configure server\.env before installing the native host."
}
if (-not (Test-Path -LiteralPath $launcherBuilder -PathType Leaf)) {
    throw "Native host launcher builder is missing: $launcherBuilder"
}

# Files from the retired HTTP server are not present in current archives, but
# Expand-Archive -Force does not remove them when updating an existing folder.
foreach ($relativePath in $obsoleteSourceFiles) {
    $obsoletePath = Join-Path $projectRoot $relativePath
    if (Test-Path -LiteralPath $obsoletePath -PathType Leaf) {
        Remove-Item -LiteralPath $obsoletePath -Force
        Write-Host "Removed obsolete file: $relativePath"
    }
}

# Always rebuild before changing the registry. TypeScript can emit JavaScript
# even when it reports errors, so the mere presence of native-host.js does not
# prove that the previous build succeeded.
Write-Host "Building the native host..."
Push-Location $projectRoot
try {
    & npm.cmd run build -w server
    if ($LASTEXITCODE -ne 0) { throw "Native host build failed. Registration was not changed." }
} finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
    throw "Native host entry point was not created: $entryPoint"
}

& $launcherBuilder
if (-not (Test-Path -LiteralPath $hostLauncher -PathType Leaf)) {
    throw "Native host launcher was not created: $hostLauncher"
}

$manifest = [ordered]@{
    name = $hostName
    description = "TabTome native host"
    path = $hostLauncher
    type = "stdio"
    allowed_extensions = @("page-to-ereader-local@local")
}
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($hostManifest, ($manifest | ConvertTo-Json -Depth 3), $utf8WithoutBom)

$chromeManifest = [ordered]@{
    name = $hostName
    description = "TabTome native host"
    path = $hostLauncher
    type = "stdio"
    allowed_origins = @("chrome-extension://fmmlphejpodoaipafggdhgklelkkdleh/")
}
$chromeManifestPath = Join-Path $hostDirectory "chrome-manifest.json"
[System.IO.File]::WriteAllText($chromeManifestPath, ($chromeManifest | ConvertTo-Json -Depth 3), $utf8WithoutBom)

New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $hostManifest
foreach ($chromeRegistryPath in $chromeRegistryPaths) {
    New-Item -Path $chromeRegistryPath -Force | Out-Null
    Set-Item -Path $chromeRegistryPath -Value $chromeManifestPath
}

Write-Host "Native host installed for the current Windows user."
Write-Host "Registry key: HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\$hostName"
Write-Host "Chrome registry keys: HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\$hostName and HKEY_CURRENT_USER\Software\Chromium\NativeMessagingHosts\$hostName"
Write-Host "Manifest: $hostManifest"
Write-Host "Restart Firefox, then open the extension settings and run diagnostics."
