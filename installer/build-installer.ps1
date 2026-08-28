param(
    [string] $NodeRuntimeDirectory,
    [string] $IsccPath,
    [switch] $SkipTests
)

$ErrorActionPreference = "Stop"
$installerDirectory = $PSScriptRoot
$root = Split-Path -Parent $installerDirectory
$stage = Join-Path $installerDirectory "stage"
$stageApp = Join-Path $stage "app"
$outputs = Join-Path $root "outputs"
$npmCache = Join-Path $root "work\npm-cache"
$serverPackage = Get-Content -Raw (Join-Path $root "server\package.json") | ConvertFrom-Json
$version = [string]$serverPackage.version

function Assert-ChildPath {
    param([string] $Parent, [string] $Child)
    $resolvedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd("\") + "\"
    $resolvedChild = [System.IO.Path]::GetFullPath($Child)
    if (-not $resolvedChild.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe build path outside $resolvedParent`: $resolvedChild"
    }
}

Assert-ChildPath $installerDirectory $stage
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageApp, $outputs | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null

if (-not $NodeRuntimeDirectory) {
    $preparedRuntime = Join-Path $root "work\node-runtime"
    if (Test-Path -LiteralPath (Join-Path $preparedRuntime "node.exe")) {
        $NodeRuntimeDirectory = $preparedRuntime
    } else {
        $NodeRuntimeDirectory = Split-Path -Parent (Get-Command node.exe -ErrorAction Stop).Source
    }
}
$NodeRuntimeDirectory = [System.IO.Path]::GetFullPath($NodeRuntimeDirectory)
$nodeExecutable = Join-Path $NodeRuntimeDirectory "node.exe"
$nodeLicense = Join-Path $NodeRuntimeDirectory "LICENSE"
if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) { throw "node.exe was not found in $NodeRuntimeDirectory" }
if (-not (Test-Path -LiteralPath $nodeLicense -PathType Leaf)) {
    throw "The Node.js LICENSE file is missing. Use the official Windows ZIP as NodeRuntimeDirectory."
}

Push-Location $root
try {
    & npm.cmd run build -w server
    if ($LASTEXITCODE -ne 0) { throw "Native host build failed." }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-windows-icon.ps1
    if ($LASTEXITCODE -ne 0) { throw "Windows icon generation failed." }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-native-launcher.ps1
    if ($LASTEXITCODE -ne 0) { throw "Native launcher build failed." }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-settings-tool.ps1
    if ($LASTEXITCODE -ne 0) { throw "Settings application build failed." }
    if (-not $SkipTests) {
        & npm.cmd run test -w server
        if ($LASTEXITCODE -ne 0) { throw "Native host tests failed." }
        & node.exe .\scripts\test-native-launcher.mjs
        if ($LASTEXITCODE -ne 0) { throw "Native launcher test failed." }
    }
} finally { Pop-Location }

$runtimeDirectory = Join-Path $stageApp "runtime"
$serverDirectory = Join-Path $stageApp "server"
$hostDirectory = Join-Path $stageApp "host"
New-Item -ItemType Directory -Force -Path $runtimeDirectory, $serverDirectory, $hostDirectory | Out-Null
Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $runtimeDirectory "node.exe")
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $runtimeDirectory "LICENSE")
Copy-Item -LiteralPath (Join-Path $root "server\dist") -Destination $serverDirectory -Recurse
Copy-Item -LiteralPath (Join-Path $installerDirectory "runtime\package.json") -Destination $serverDirectory
Copy-Item -LiteralPath (Join-Path $installerDirectory "runtime\package-lock.json") -Destination $serverDirectory

& npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund --cache $npmCache --prefix $serverDirectory
if ($LASTEXITCODE -ne 0) { throw "Production dependency staging failed." }

Copy-Item -LiteralPath (Join-Path $root "host\TabTomeHost.exe") -Destination $hostDirectory
Copy-Item -LiteralPath (Join-Path $root "host\TabTomeSettings.exe") -Destination (Join-Path $stageApp "TabTomeSettings.exe")
Copy-Item -LiteralPath (Join-Path $root "host\app.ico") -Destination (Join-Path $stageApp "TabTome.ico")
Copy-Item -LiteralPath (Join-Path $installerDirectory "INSTALLED-README.txt") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $installerDirectory "THIRD-PARTY-NOTICES.txt") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination $stageApp
[System.IO.File]::WriteAllText((Join-Path $stageApp "version.txt"), "$version`r`n", (New-Object System.Text.UTF8Encoding($false)))

& (Join-Path $installerDirectory "compile-installer.ps1") -IsccPath $IsccPath
