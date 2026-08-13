param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$backupDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("page-to-ereader-secrets-" + [guid]::NewGuid().ToString("N"))
$protectedFiles = @("server\.env", "server\.smtp-pass", "server\data\settings.json")
$obsoleteFiles = @(
    "server\src\app.ts",
    "server\src\app.test.ts",
    "server\src\auth.ts",
    "server\src\auth.test.ts",
    "server\src\index.ts"
)
New-Item -ItemType Directory -Path $backupDirectory | Out-Null

try {
    foreach ($relativePath in $protectedFiles) {
        $source = Join-Path $projectRoot $relativePath
        if (Test-Path -LiteralPath $source -PathType Leaf) {
            $backupName = $relativePath.Replace("\", "__")
            Copy-Item -LiteralPath $source -Destination (Join-Path $backupDirectory $backupName)
        }
    }

    Expand-Archive -LiteralPath $resolvedArchive -DestinationPath $projectRoot -Force

    # Expand-Archive replaces files but does not remove files deleted in newer
    # releases. Remove only the explicitly known files of the retired HTTP server.
    foreach ($relativePath in $obsoleteFiles) {
        $obsoletePath = Join-Path $projectRoot $relativePath
        if (Test-Path -LiteralPath $obsoletePath -PathType Leaf) {
            Remove-Item -LiteralPath $obsoletePath -Force
        }
    }

    foreach ($relativePath in $protectedFiles) {
        $backupName = $relativePath.Replace("\", "__")
        $backup = Join-Path $backupDirectory $backupName
        if (Test-Path -LiteralPath $backup -PathType Leaf) {
            Copy-Item -LiteralPath $backup -Destination (Join-Path $projectRoot $relativePath) -Force
        }
    }
} finally {
    $resolvedBackup = [System.IO.Path]::GetFullPath($backupDirectory)
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedBackup.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedBackup)) {
        Remove-Item -LiteralPath $resolvedBackup -Recurse -Force
    }
}

Write-Host "Project updated. Secrets were preserved and obsolete HTTP server files were removed."
