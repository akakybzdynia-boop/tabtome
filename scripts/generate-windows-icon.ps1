param(
    [string] $Source,
    [string] $Destination
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $root "extension\icons\icon-64.png" }
if (-not $Destination) { $Destination = Join-Path $root "host\app.ico" }

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TabTomeNativeIcon {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
"@

$bitmap = New-Object System.Drawing.Bitmap($Source)
$handle = $bitmap.GetHicon()
try {
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    try {
        $directory = Split-Path -Parent $Destination
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
        $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create)
        try { $icon.Save($stream) } finally { $stream.Dispose() }
    } finally { $icon.Dispose() }
} finally {
    [TabTomeNativeIcon]::DestroyIcon($handle) | Out-Null
    $bitmap.Dispose()
}

Write-Host "Windows icon generated: $Destination"
