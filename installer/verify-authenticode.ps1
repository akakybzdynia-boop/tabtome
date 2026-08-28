param(
    [Parameter(Mandatory)]
    [string[]] $Path,

    [switch] $RequireSigned
)

$ErrorActionPreference = "Stop"
$results = foreach ($item in $Path) {
    $resolved = (Resolve-Path -LiteralPath $item -ErrorAction Stop).Path
    $signature = Get-AuthenticodeSignature -LiteralPath $resolved
    [pscustomobject]@{
        Path = $resolved
        Status = [string]$signature.Status
        Subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "" }
        Timestamp = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { "" }
    }
}

$results | Format-Table -AutoSize
if ($RequireSigned) {
    $invalid = @($results | Where-Object { $_.Status -ne "Valid" })
    if ($invalid.Count -gt 0) {
        throw "Authenticode verification failed for $($invalid.Count) file(s)."
    }
}
