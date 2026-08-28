$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$hostDirectory = Join-Path $projectRoot "host"
$source = Join-Path $hostDirectory "settings.cs"
$output = Join-Path $hostDirectory "TabTomeSettings.exe"
$icon = Join-Path $hostDirectory "app.ico"

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Settings application source is missing: $source"
}

$compilerCandidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $compiler) { throw "The built-in Windows C# compiler was not found." }

$arguments = @(
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/reference:System.dll",
    "/reference:System.Core.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Web.Extensions.dll",
    "/reference:System.Windows.Forms.dll",
    "/out:$output"
)
if (Test-Path -LiteralPath $icon -PathType Leaf) { $arguments += "/win32icon:$icon" }
$arguments += $source

& $compiler @arguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw "Settings application compilation failed."
}

Write-Host "Settings application built: $output"
