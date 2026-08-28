param(
    [string] $IsccPath
)

$ErrorActionPreference = "Stop"
$installerDirectory = $PSScriptRoot
$root = Split-Path -Parent $installerDirectory
$outputs = Join-Path $root "outputs"
$stageApp = Join-Path $installerDirectory "stage\app"
$serverPackage = Get-Content -Raw -LiteralPath (Join-Path $root "server\package.json") | ConvertFrom-Json
$version = [string]$serverPackage.version

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string] $Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
        finally { $algorithm.Dispose() }
    } finally { $stream.Dispose() }
}

if (-not (Test-Path -LiteralPath (Join-Path $stageApp "host\TabTomeHost.exe") -PathType Leaf)) {
    throw "The staged native host is missing. Run build-installer.ps1 first."
}
if (-not (Test-Path -LiteralPath (Join-Path $stageApp "TabTomeSettings.exe") -PathType Leaf)) {
    throw "The staged settings application is missing. Run build-installer.ps1 first."
}

if (-not $IsccPath) {
    $isccCandidates = @(
        (Join-Path $root "work\tools\inno\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 7\ISCC.exe")
    )
    $IsccPath = $isccCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
}
if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath -PathType Leaf)) {
    throw "ISCC.exe was not found. Run installer/prepare-build-tools.ps1, install Inno Setup 6.7+, or pass -IsccPath."
}

New-Item -ItemType Directory -Force -Path $outputs | Out-Null
& $IsccPath /Qp (Join-Path $installerDirectory "TabTome.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

$installer = Join-Path $outputs "TabTome-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Installer output is missing: $installer" }
$hash = Get-Sha256Hex -Path $installer
[System.IO.File]::WriteAllText("$installer.sha256", "$hash  $(Split-Path $installer -Leaf)`r`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Installer built successfully."
Get-Item -LiteralPath $installer | Select-Object FullName, Length
Get-Content -LiteralPath "$installer.sha256"
