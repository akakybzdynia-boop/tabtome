$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$extensionDirectory = Join-Path $projectRoot "extension\dist"
$launcher = Join-Path $projectRoot "host\TabTomeHost.exe"
$testScript = Join-Path $projectRoot "scripts\test-firefox-native-load.mjs"
$hostName = "page_to_ereader_local"
$registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$hostName"
$firefoxCandidates = @(
    (Join-Path $env:ProgramFiles "Mozilla Firefox\firefox.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Mozilla Firefox\firefox.exe")
)
$firefox = $firefoxCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $firefox) { throw "Firefox was not found." }
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { & (Join-Path $projectRoot "build-native-launcher.ps1") }
if (-not (Test-Path -LiteralPath $extensionDirectory -PathType Container)) { throw "Build the extension before running this test." }

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("page-to-ereader-firefox-test-" + [guid]::NewGuid().ToString("N"))
$profile = Join-Path $temporaryRoot "profile"
$manifest = Join-Path $temporaryRoot "manifest.json"
New-Item -ItemType Directory -Path $profile | Out-Null
$hadRegistryKey = Test-Path -LiteralPath $registryPath
$previousManifest = if ($hadRegistryKey) { (Get-Item -LiteralPath $registryPath).GetValue("") } else { $null }

try {
    $nativeManifest = [ordered]@{
        name = $hostName
        description = "TabTome automated Firefox test"
        path = $launcher
        type = "stdio"
        allowed_extensions = @("page-to-ereader-local@local")
    }
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifest, ($nativeManifest | ConvertTo-Json -Depth 3), $utf8WithoutBom)
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $manifest

    & node.exe $testScript $firefox $profile $extensionDirectory
    if ($LASTEXITCODE -ne 0) { throw "The real Firefox Native Messaging load test failed." }
} finally {
    if ($hadRegistryKey) {
        New-Item -Path $registryPath -Force | Out-Null
        Set-Item -Path $registryPath -Value $previousManifest
    } elseif (Test-Path -LiteralPath $registryPath) {
        Remove-Item -LiteralPath $registryPath -Force
    }
    $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryRoot)
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemporary.StartsWith($resolvedSystemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemporary)) {
        Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    }
}
