$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$hostDirectory = Join-Path $projectRoot "host"
$source = Join-Path $hostDirectory "launcher.cs"
$output = Join-Path $hostDirectory "PageToEreaderHost.exe"
$nodePathFile = Join-Path $hostDirectory "node-path.txt"
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js is not installed or is not available in PATH." }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Native launcher source is missing: $source" }

$compilerCandidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $compiler) { throw "The built-in Windows C# compiler was not found." }

$arguments = @("/nologo", "/target:winexe", "/platform:anycpu", "/optimize+", "/out:$output", $source)
& $compiler @arguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw "Native launcher compilation failed."
}

$ascii = New-Object System.Text.ASCIIEncoding
[System.IO.File]::WriteAllText($nodePathFile, $node.Source, $ascii)
Write-Host "Windowless native launcher built: $output"
