param(
    [string] $InstallerPath
)

$ErrorActionPreference = "Stop"
$installerDirectory = $PSScriptRoot
$root = Split-Path -Parent $installerDirectory
if (-not $InstallerPath) { $InstallerPath = Join-Path $root "outputs\TabTome-Setup-0.11.1.exe" }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("TabTomeInstallerTest-" + [guid]::NewGuid().ToString("N"))
$installDirectory = Join-Path $testRoot "app"
$dataDirectory = Join-Path $testRoot "data"
$legacyRoot = Join-Path $testRoot "legacy"
$setupLog = Join-Path $testRoot "setup.log"
$registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\page_to_ereader_local"
$hadRegistration = Test-Path -LiteralPath $registryPath
$previousRegistration = if ($hadRegistration) { (Get-Item -LiteralPath $registryPath).GetValue("") } else { $null }

function Assert-TestPath {
    param([string] $Path)
    $resolvedRoot = [System.IO.Path]::GetFullPath($testRoot).TrimEnd("\") + "\"
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if ($resolvedPath.TrimEnd("\") -ne $resolvedRoot.TrimEnd("\") -and
        -not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe test path outside $resolvedRoot`: $resolvedPath"
    }
}

Assert-TestPath $installDirectory
Assert-TestPath $dataDirectory
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
    $legacyHost = Join-Path $legacyRoot "host"
    $legacyServer = Join-Path $legacyRoot "server"
    New-Item -ItemType Directory -Force -Path $legacyHost, (Join-Path $legacyServer "data") | Out-Null
    $legacyManifest = Join-Path $legacyHost "manifest.json"
    [System.IO.File]::WriteAllText($legacyManifest, "{}`r`n", (New-Object System.Text.UTF8Encoding($false)))
    $legacyEnvironment = @(
        "SMTP_HOST=smtp.example.com",
        "SMTP_PORT=587",
        "SMTP_SECURE=false",
        "SMTP_USER=sender@example.com",
        "SMTP_FROM=sender@example.com",
        "KINDLE_EMAIL=reader@kindle.com"
    ) -join "`r`n"
    [System.IO.File]::WriteAllText((Join-Path $legacyServer ".env"), "$legacyEnvironment`r`n", (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText((Join-Path $legacyServer ".smtp-pass"), "lazy-dpapi-placeholder", (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText((Join-Path $legacyServer "data\settings.json"),
        "{`r`n  `"senderEmail`": `"sender@example.com`",`r`n  `"kindleEmail`": `"reader@kindle.com`",`r`n  `"amazonSenderApproved`": true`r`n}`r`n",
        (New-Object System.Text.UTF8Encoding($false)))
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -LiteralPath $registryPath -Value $legacyManifest

    $setupArguments = @(
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/NORESTART",
        "/DIR=$installDirectory",
        "/DataDir=$dataDirectory",
        "/LOG=$setupLog"
    )
    $setup = Start-Process -FilePath $InstallerPath -ArgumentList $setupArguments -WindowStyle Hidden -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Installer exited with $($setup.ExitCode). See $setupLog" }

    $hostExecutable = Join-Path $installDirectory "host\TabTomeHost.exe"
    $settingsExecutable = Join-Path $installDirectory "TabTomeSettings.exe"
    $runtimeExecutable = Join-Path $installDirectory "runtime\node.exe"
    $manifestFile = Join-Path $installDirectory "host\manifest.json"
    $licenseFile = Join-Path $installDirectory "LICENSE"
    foreach ($file in @($hostExecutable, $settingsExecutable, $runtimeExecutable, $manifestFile, $licenseFile)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Installed file is missing: $file" }
    }
    if ((Get-Content -LiteralPath $licenseFile -TotalCount 1) -ne "Mozilla Public License Version 2.0") {
        throw "Installed project license is invalid."
    }

    $manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
    if ($manifest.name -ne "page_to_ereader_local" -or $manifest.path -ne $hostExecutable -or
        $manifest.allowed_extensions[0] -ne "page-to-ereader-local@local") {
        throw "Installed Native Messaging manifest is invalid."
    }
    if ((Get-Content -Raw -LiteralPath (Join-Path $installDirectory "host\node-path.txt")).Trim() -ne $runtimeExecutable) {
        throw "Installed launcher does not point to the bundled Node.js runtime."
    }
    if ((Get-Content -Raw -LiteralPath (Join-Path $installDirectory "host\data-root.txt")).Trim() -ne $dataDirectory) {
        throw "Installed launcher does not point to the isolated user data directory."
    }
    if ((Get-Item -LiteralPath $registryPath).GetValue("") -ne $manifestFile) {
        throw "Firefox Native Messaging registry value is invalid."
    }
    if ((Get-Content -Raw -LiteralPath (Join-Path $dataDirectory ".env")) -ne "$legacyEnvironment`r`n" -or
        (Get-Content -Raw -LiteralPath (Join-Path $dataDirectory ".smtp-pass")) -ne "lazy-dpapi-placeholder" -or
        -not (Test-Path -LiteralPath (Join-Path $dataDirectory "data\settings.json") -PathType Leaf)) {
        throw "Legacy settings or protected password were not migrated."
    }
    & node.exe (Join-Path $root "scripts\test-installed-launcher.mjs") $hostExecutable $dataDirectory
    if ($LASTEXITCODE -ne 0) { throw "Installed native launcher test failed." }

    $uninstaller = Join-Path $installDirectory "unins000.exe"
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw "Uninstaller is missing." }
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART") -WindowStyle Hidden -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited with $($uninstall.ExitCode)." }
    for ($attempt = 0; $attempt -lt 50 -and (Test-Path -LiteralPath $installDirectory); $attempt++) {
        Start-Sleep -Milliseconds 100
    }
    if (Test-Path -LiteralPath $installDirectory) {
        $remaining = @(Get-ChildItem -LiteralPath $installDirectory -Recurse -Force | ForEach-Object FullName)
        throw "Application directory remains after uninstall: $($remaining -join ', ')"
    }

    Write-Host "Silent install, bundled runtime, Native Messaging registration and uninstall: OK"
} finally {
    if ($hadRegistration) {
        New-Item -Path $registryPath -Force | Out-Null
        Set-Item -LiteralPath $registryPath -Value $previousRegistration
    } elseif (Test-Path -LiteralPath $registryPath) {
        Remove-Item -LiteralPath $registryPath -Force
    }
    if (Test-Path -LiteralPath $testRoot) {
        Assert-TestPath $testRoot
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
