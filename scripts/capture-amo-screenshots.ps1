param(
  [string]$BrowserPath = "",
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $BrowserPath) {
  $browserCandidates = @(
    "$env:LOCALAPPDATA\Chromium\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  $BrowserPath = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

if (-not $BrowserPath -or -not (Test-Path -LiteralPath $BrowserPath)) {
  throw "Chrome, Chromium, or Edge was not found. Pass -BrowserPath explicitly."
}

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot "outputs\amo-screenshots-v0.11.0"
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$profileDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("tabtome-screenshots-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $profileDirectory | Out-Null

$items = @(
  @{ Source = "tabs.html"; Target = "01-tabs-1280x800.png" },
  @{ Source = "text.html"; Target = "02-text-1280x800.png" },
  @{ Source = "settings.html"; Target = "03-settings-1280x800.png" }
)

try {
  foreach ($item in $items) {
    $sourcePath = Join-Path $projectRoot ("design\amo-screenshots\" + $item.Source)
    $targetPath = Join-Path $resolvedOutput $item.Target
    $sourceUri = [System.Uri]::new($sourcePath).AbsoluteUri
    if (Test-Path -LiteralPath $targetPath -PathType Leaf) { Remove-Item -LiteralPath $targetPath -Force }
    $arguments = @(
      "--user-data-dir=$profileDirectory",
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=1",
      "--window-size=1280,800",
      "--screenshot=$targetPath",
      $sourceUri
    )
    $browser = Start-Process -FilePath $BrowserPath -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($browser.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $targetPath)) {
      throw "Screenshot generation failed: $($item.Target)"
    }
  }
} finally {
  $resolvedProfile = [System.IO.Path]::GetFullPath($profileDirectory)
  $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\") + "\"
  if ($resolvedProfile.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedProfile -PathType Container)) {
    Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
  }
}

Add-Type -AssemblyName System.Drawing
foreach ($item in $items) {
  $targetPath = Join-Path $resolvedOutput $item.Target
  $image = [System.Drawing.Image]::FromFile($targetPath)
  try {
    if ($image.Width -ne 1280 -or $image.Height -ne 800) {
      throw "$($item.Target) has size $($image.Width)x$($image.Height), expected 1280x800."
    }
  } finally {
    $image.Dispose()
  }
}

Write-Host "AMO screenshots created in $resolvedOutput"
