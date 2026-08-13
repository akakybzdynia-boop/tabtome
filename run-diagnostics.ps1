$ErrorActionPreference = "Stop"

$serverDirectory = Join-Path $PSScriptRoot "server"
$diagnostics = Join-Path $serverDirectory "dist\diagnose.js"
if (-not (Test-Path -LiteralPath $diagnostics -PathType Leaf)) {
    Push-Location $PSScriptRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "Project build failed." }
    } finally {
        Pop-Location
    }
}

Push-Location $serverDirectory
try {
    & node.exe $diagnostics
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
