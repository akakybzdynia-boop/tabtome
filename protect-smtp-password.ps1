$ErrorActionPreference = "Stop"

$passwordFile = Join-Path $PSScriptRoot "server\.smtp-pass"
$securePassword = Read-Host "Enter the SMTP app password (input is hidden)" -AsSecureString
if ($securePassword.Length -eq 0) { throw "The password cannot be empty." }

$encrypted = ConvertFrom-SecureString -SecureString $securePassword
Set-Content -LiteralPath $passwordFile -Value $encrypted -Encoding utf8

Write-Host "The SMTP password was encrypted for the current Windows user."
Write-Host "Saved to: $passwordFile"
Write-Host "Now remove the SMTP_PASS=... line from server\.env and run diagnostics."
