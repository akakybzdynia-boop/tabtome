param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\extension\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#1769AA"))
$paper = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Colors]::White)
$fold = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#A9D4F4"))
$arrowBrush = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString("#157347"))
$arrowPen = New-Object System.Windows.Media.Pen ($arrowBrush, 5)
$arrowPen.StartLineCap = [System.Windows.Media.PenLineCap]::Round
$arrowPen.EndLineCap = [System.Windows.Media.PenLineCap]::Round
$arrowPen.LineJoin = [System.Windows.Media.PenLineJoin]::Round

foreach ($size in @(16, 32, 48, 64, 96)) {
    $visual = New-Object System.Windows.Media.DrawingVisual
    $drawing = $visual.RenderOpen()
    try {
        $drawing.PushTransform((New-Object System.Windows.Media.ScaleTransform ($size / 64.0), ($size / 64.0)))
        $drawing.DrawRoundedRectangle($background, $null, (New-Object System.Windows.Rect 1, 1, 62, 62), 14, 14)
        $drawing.DrawGeometry($paper, $null, [System.Windows.Media.Geometry]::Parse("M16,10 L36,10 L49,23 L49,52 L16,52 Z"))
        $drawing.DrawGeometry($fold, $null, [System.Windows.Media.Geometry]::Parse("M36,10 L49,23 L36,23 Z"))
        $drawing.DrawLine($arrowPen, (New-Object System.Windows.Point 24, 38), (New-Object System.Windows.Point 43, 38))
        $drawing.DrawLine($arrowPen, (New-Object System.Windows.Point 36, 31), (New-Object System.Windows.Point 43, 38))
        $drawing.DrawLine($arrowPen, (New-Object System.Windows.Point 43, 38), (New-Object System.Windows.Point 36, 45))
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
