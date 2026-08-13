$ErrorActionPreference = "Stop"

$passwordFile = Join-Path $PSScriptRoot "server\.smtp-pass"
$environmentFile = Join-Path $PSScriptRoot "server\.env"
$temporaryPasswordFile = "$passwordFile.$([guid]::NewGuid().ToString('N')).tmp"
$temporaryEnvironmentFile = "$environmentFile.$([guid]::NewGuid().ToString('N')).tmp"
$securePassword = Read-Host "Enter the SMTP app password (input is hidden)" -AsSecureString
if ($securePassword.Length -eq 0) { throw "The password cannot be empty." }

$encrypted = ConvertFrom-SecureString -SecureString $securePassword
$roundtrip = ConvertTo-SecureString $encrypted
$originalCredential = New-Object System.Management.Automation.PSCredential("smtp", $securePassword)
$credential = New-Object System.Management.Automation.PSCredential("smtp", $roundtrip)
if ($credential.GetNetworkCredential().Password -cne $originalCredential.GetNetworkCredential().Password) {
    throw "DPAPI verification failed. No files were changed."
}
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

try {
    [System.IO.File]::WriteAllText($temporaryPasswordFile, $encrypted, $utf8WithoutBom)
    Move-Item -LiteralPath $temporaryPasswordFile -Destination $passwordFile -Force

    if (Test-Path -LiteralPath $environmentFile -PathType Leaf) {
        $lines = [System.IO.File]::ReadAllLines($environmentFile)
        $sanitized = @($lines | Where-Object { $_ -notmatch '^\s*(?:export\s+)?SMTP_PASS\s*=' })
        [System.IO.File]::WriteAllLines($temporaryEnvironmentFile, $sanitized, $utf8WithoutBom)
        Move-Item -LiteralPath $temporaryEnvironmentFile -Destination $environmentFile -Force
    }
} finally {
    Remove-Item -LiteralPath $temporaryPasswordFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryEnvironmentFile -Force -ErrorAction SilentlyContinue
}

Write-Host "The SMTP password was encrypted for the current Windows user."
Write-Host "Saved to: $passwordFile"
Write-Host "Any SMTP_PASS line was removed from server\.env automatically."
Write-Host "Run diagnostics to verify the SMTP connection."
