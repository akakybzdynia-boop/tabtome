param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\extension\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#003049"))
$book = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#FFB000"))
$gutterPen = New-Object System.Windows.Media.Pen ($background, 2.5)

foreach ($size in @(16, 32, 48, 64, 96, 128)) {
    $visual = New-Object System.Windows.Media.DrawingVisual
    $drawing = $visual.RenderOpen()
    try {
        $drawing.PushTransform((New-Object System.Windows.Media.ScaleTransform ($size / 64.0), ($size / 64.0)))
        $drawing.DrawRoundedRectangle($background, $null, (New-Object System.Windows.Rect 1, 1, 62, 62), 14, 14)
        $drawing.DrawGeometry($book, $null, [System.Windows.Media.Geometry]::Parse("M7,15 C16,13 25,16 32,23 L32,56 C25,50 16,48 7,50 Z M57,15 C48,13 39,16 32,23 L32,56 C39,50 48,48 57,50 Z"))
        $drawing.DrawLine($gutterPen, (New-Object System.Windows.Point 32, 23), (New-Object System.Windows.Point 32, 56))
        $drawing.Pop()
    } finally {
        $drawing.Close()
    }

    $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap $size, $size, 96, 96, ([System.Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $path = Join-Path $OutputDirectory "icon-$size.png"
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create)
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
}

Write-Host "Generated extension icons in $OutputDirectory"
