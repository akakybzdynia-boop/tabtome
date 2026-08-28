param(
    [string] $NodeVersion = "24.18.1",
    [string] $InnoVersion = "6.7.3"
)

$ErrorActionPreference = "Stop"
$installerDirectory = $PSScriptRoot
$root = Split-Path -Parent $installerDirectory
$work = Join-Path $root "work"
$downloads = Join-Path $work "downloads"
$nodeRuntime = Join-Path $work "node-runtime"
$innoDirectory = Join-Path $work "tools\inno"

function Assert-WorkPath {
    param([string] $Path)
    $resolvedWork = [System.IO.Path]::GetFullPath($work).TrimEnd("\") + "\"
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedWork, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe tool path outside work: $resolvedPath"
    }
}

New-Item -ItemType Directory -Force -Path $downloads | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $nodeRuntime "node.exe") -PathType Leaf)) {
    $nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
    $nodeArchive = Join-Path $downloads $nodeArchiveName
    $checksums = Join-Path $downloads "SHASUMS256-$NodeVersion.txt"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile $checksums
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/$nodeArchiveName" -OutFile $nodeArchive
    $checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match "\s+$([regex]::Escape($nodeArchiveName))$" } | Select-Object -First 1
    if (-not $checksumLine) { throw "Node.js archive checksum was not found in SHASUMS256.txt." }
    $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $nodeArchive).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Node.js archive checksum mismatch." }

    $extractRoot = Join-Path $work ("node-extract-" + [guid]::NewGuid().ToString("N"))
    Assert-WorkPath $extractRoot
    New-Item -ItemType Directory -Path $extractRoot | Out-Null
    try {
        Expand-Archive -LiteralPath $nodeArchive -DestinationPath $extractRoot
        $expanded = Join-Path $extractRoot "node-v$NodeVersion-win-x64"
        if (-not (Test-Path -LiteralPath (Join-Path $expanded "node.exe") -PathType Leaf) -or
            -not (Test-Path -LiteralPath (Join-Path $expanded "LICENSE") -PathType Leaf)) {
            throw "Official Node.js archive has an unexpected layout."
        }
        Assert-WorkPath $nodeRuntime
        if (Test-Path -LiteralPath $nodeRuntime) { Remove-Item -LiteralPath $nodeRuntime -Recurse -Force }
        Move-Item -LiteralPath $expanded -Destination $nodeRuntime
    } finally {
        if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    }
}

$iscc = Join-Path $innoDirectory "ISCC.exe"
if (-not (Test-Path -LiteralPath $iscc -PathType Leaf)) {
    $innoInstaller = Join-Path $downloads "innosetup-$InnoVersion.exe"
    $tag = "is-" + $InnoVersion.Replace('.', '_')
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/jrsoftware/issrc/releases/download/$tag/innosetup-$InnoVersion.exe" -OutFile $innoInstaller
    $signature = Get-AuthenticodeSignature -LiteralPath $innoInstaller
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
        $signature.SignerCertificate.Subject -notmatch 'Pyrsys B\.V\.') {
        throw "Inno Setup installer signature is not valid or has an unexpected publisher: $($signature.Status) $($signature.SignerCertificate.Subject)"
    }
    Assert-WorkPath $innoDirectory
    New-Item -ItemType Directory -Force -Path $innoDirectory | Out-Null
    $arguments = @(
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/NORESTART",
        "/CURRENTUSER",
        "/DIR=$innoDirectory"
    )
    $process = Start-Process -FilePath $innoInstaller -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $iscc -PathType Leaf)) {
        throw "Inno Setup installation failed with exit code $($process.ExitCode)."
    }
}

Write-Host "Pinned build tools are ready."
& (Join-Path $nodeRuntime "node.exe") --version
$innoProbe = Start-Process -FilePath $iscc -ArgumentList "/?" -WindowStyle Hidden -Wait -PassThru
if ($innoProbe.ExitCode -notin @(0, 1)) {
    throw "Inno Setup compiler probe failed with exit code $($innoProbe.ExitCode)."
}
Write-Host "Inno Setup compiler verified."
