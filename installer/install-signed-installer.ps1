param(
    [Parameter(Mandatory)]
    [string] $SignedArtifactDirectory
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serverPackage = Get-Content -Raw -LiteralPath (Join-Path $root "server\package.json") | ConvertFrom-Json
$version = [string]$serverPackage.version
$fileName = "TabTome-Setup-$version.exe"
$source = Join-Path ([System.IO.Path]::GetFullPath($SignedArtifactDirectory)) $fileName
$destination = Join-Path $root "outputs\$fileName"

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string] $Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
        finally { $algorithm.Dispose() }
    } finally { $stream.Dispose() }
}

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Signed installer is missing: $source"
}

& (Join-Path $PSScriptRoot "verify-authenticode.ps1") -Path @($source) -RequireSigned
Copy-Item -LiteralPath $source -Destination $destination -Force
$hash = Get-Sha256Hex -Path $destination
[System.IO.File]::WriteAllText("$destination.sha256", "$hash  $fileName`r`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Signed installer copied to outputs and its SHA-256 was regenerated."
