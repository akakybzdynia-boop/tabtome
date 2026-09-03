$ErrorActionPreference = "Stop"

$hostName = "page_to_ereader_local"
$registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$hostName"
$chromeRegistryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName"
)

if (Test-Path -LiteralPath $registryPath) {
    Remove-Item -LiteralPath $registryPath -Force
    Write-Host "Native host registration was removed for the current Windows user."
} else {
    Write-Host "Native host registration is not installed."
}
foreach ($chromeRegistryPath in $chromeRegistryPaths) {
    if (Test-Path -LiteralPath $chromeRegistryPath) { Remove-Item -LiteralPath $chromeRegistryPath -Force }
}

Write-Host "Project files, SMTP settings, job history and logs were not deleted."
