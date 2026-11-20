# Generate a self-signed code-signing certificate for local sideload testing ONLY.
# Not needed for Microsoft Store submission (the Store re-signs the package).
# The PFX is exported to the project certs/ directory (excluded via .gitignore).
#
# NOTE: This file must stay ASCII-only. Windows PowerShell 5 reads .ps1 files
# using the system ANSI codepage; non-ASCII (e.g. UTF-8 Chinese) without a BOM
# gets mangled and breaks the parser.
param(
  [string]$Subject = "CN=Git Repo Manager Dev Test",
  [string]$CertDir  = "certs",
  [string]$PfxPassword = $env:GRM_PFX_PASS
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $projectRoot $CertDir
New-Item -ItemType Directory -Force $certDir | Out-Null
$pfxPath = Join-Path $certDir "GitRepoManagerDev.pfx"

if (-not $PfxPassword) { $PfxPassword = "grm-dev" }

# Remove any prior cert with the same subject to avoid duplicates.
Get-ChildItem "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $Subject } | Remove-Item -Force -ErrorAction SilentlyContinue

# Create a self-signed code-signing certificate (EKU: Code Signing).
$cert = New-SelfSignedCertificate `
  -Type Custom `
  -Subject $Subject `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -FriendlyName "Git Repo Manager Dev Test" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

# Export PFX for electron-builder to sign with (do this before trusting so the
# artifact always exists even if a trust step fails).
$securePwd = ConvertTo-SecureString -String $PfxPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd | Out-Null

# Trust into the current user stores required for sideload.
# Use the .NET X509Store API directly: Copy-Item to the cert: provider is not
# supported and Import-Certificate needs a separate .cer file.
function Add-CertToStore([System.Security.Cryptography.X509Certificates.X509Certificate2]$c, [string]$storeName) {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  $already = $store.Certificates | Where-Object { $_.Thumbprint -eq $c.Thumbprint }
  if (-not $already) {
    $store.Add($c)
    Write-Host "[trust] trusted into CurrentUser\$storeName"
  } else {
    Write-Host "[trust] already trusted in CurrentUser\$storeName"
  }
  $store.Close()
}

# For self-signed sideload certs, TrustedPeople alone is sufficient (the cert is
# its own root, so no separate Root-store trust is required). We deliberately do
# NOT install into CurrentUser\Root: doing so triggers an interactive Windows
# security dialog ("install a certification authority") that cannot be suppressed
# from this script and hangs non-interactive sessions.
Add-CertToStore $cert "TrustedPeople"

Write-Host ""
Write-Host "[cert] self-signed code-signing certificate created"
Write-Host "  Subject   : $($cert.Subject)"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  PFX       : $pfxPath"
$src = if ($env:GRM_PFX_PASS) { "env GRM_PFX_PASS" } else { "default grm-dev (override with GRM_PFX_PASS)" }
Write-Host "  Password  : $src"
Write-Host ""
Write-Host "Sideload requires Developer Mode or 'Allow sideload apps' to be enabled."
