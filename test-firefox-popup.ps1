$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$extensionDirectory = Join-Path $projectRoot "extension\dist"
$testScript = Join-Path $projectRoot "scripts\test-firefox-popup.mjs"
$outputDirectory = Join-Path $projectRoot "work\ui-0.9.0"
$firefoxCandidates = @(
    (Join-Path $env:ProgramFiles "Mozilla Firefox\firefox.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Mozilla Firefox\firefox.exe")
)
$firefox = $firefoxCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $firefox) { throw "Firefox was not found." }
if (-not (Test-Path -LiteralPath $extensionDirectory -PathType Container)) { throw "Build the extension before running this test." }

& node.exe $testScript $firefox $extensionDirectory $outputDirectory
if ($LASTEXITCODE -ne 0) { throw "Firefox popup UI test failed." }
Write-Host "Screenshots: $outputDirectory"
