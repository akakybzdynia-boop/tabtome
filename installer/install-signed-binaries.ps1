param(
    [Parameter(Mandatory)]
    [string] $SignedArtifactDirectory
)

$ErrorActionPreference = "Stop"
$installerDirectory = $PSScriptRoot
$stageApp = Join-Path $installerDirectory "stage\app"
$signedRoot = [System.IO.Path]::GetFullPath($SignedArtifactDirectory)

$sourceHost = Join-Path $signedRoot "host\TabTomeHost.exe"
$sourceSettings = Join-Path $signedRoot "TabTomeSettings.exe"
$destinationHost = Join-Path $stageApp "host\TabTomeHost.exe"
$destinationSettings = Join-Path $stageApp "TabTomeSettings.exe"

foreach ($path in @($sourceHost, $sourceSettings, $destinationHost, $destinationSettings)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required binary is missing: $path"
    }
}

& (Join-Path $installerDirectory "verify-authenticode.ps1") -Path @($sourceHost, $sourceSettings) -RequireSigned
Copy-Item -LiteralPath $sourceHost -Destination $destinationHost -Force
Copy-Item -LiteralPath $sourceSettings -Destination $destinationSettings -Force

Write-Host "Signed application binaries installed into the installer stage."
