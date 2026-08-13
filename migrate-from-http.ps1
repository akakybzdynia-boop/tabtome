$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$legacyEntryPoint = Join-Path $projectRoot "server\dist\index.js"
$legacyWatchdog = Join-Path $projectRoot "watchdog.cmd"
$startupDirectory = [Environment]::GetFolderPath("Startup")
$startupShortcut = Join-Path $startupDirectory "Page to E-reader Local Server.lnk"
$legacyVbs = Join-Path $startupDirectory "Page to E-reader Local Server.vbs"
$legacyTaskName = "Page to E-reader Local Server"

Write-Host "Removing the old HTTP autostart and stopping this project's legacy processes..."

foreach ($startupFile in @($startupShortcut, $legacyVbs)) {
    if (Test-Path -LiteralPath $startupFile -PathType Leaf) {
        Remove-Item -LiteralPath $startupFile -Force
    }
}

$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacyTask) {
    try { Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false } catch {
        Write-Warning "Could not remove the old scheduled task: $($_.Exception.Message)"
    }
}

$escapedWatchdog = [Regex]::Escape($legacyWatchdog)
$escapedEntryPoint = [Regex]::Escape($legacyEntryPoint)
$watchdogProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq "cmd.exe" -and $_.CommandLine -match $escapedWatchdog
}
foreach ($process in $watchdogProcesses) {
    try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop } catch {
        Write-Warning "Could not stop old watchdog process $($process.ProcessId): $($_.Exception.Message)"
    }
}

Start-Sleep -Milliseconds 250
$serverProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq "node.exe" -and $_.CommandLine -match $escapedEntryPoint
}
foreach ($process in $serverProcesses) {
    try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop } catch {
        Write-Warning "Could not stop old server process $($process.ProcessId): $($_.Exception.Message)"
    }
}

$obsoleteFiles = @(
    "install-autostart.ps1",
    "launch-watchdog.ps1",
    "run-server.ps1",
    "stop-service.ps1",
    "uninstall-autostart.ps1",
    "watchdog.cmd",
    "host\host.bat",
    "server\.token"
)
foreach ($relativePath in $obsoleteFiles) {
    $path = Join-Path $projectRoot $relativePath
    if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
}

Write-Host "Legacy HTTP autostart was removed. SMTP settings, job history and logs were preserved."
