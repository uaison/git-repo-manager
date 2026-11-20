# Code-signing helper for GitNest release artifacts.
#
# When to use:
#   - after-pack.js signs the app exe during the build (only if GITNEST_SIGN_* is set).
#   - run THIS script AFTER `npm run build:win` to sign the NSIS installer + portable exe,
#     because win.signAndEditExecutable=false leaves them unsigned.
#
# Certificate source (pick ONE):
#   A) cert already in a store:  -CertSubject "CN=Your Company, Inc."   (recommended for OV/EV)
#   B) a PFX file:               -PfxPath certs\release.pfx  (+ password via $env:GITNEST_PFX_PASS or -PfxPassword)
#
# For a REAL public release use a trusted OV/EV code-signing cert (or Azure Trusted Signing).
# The self-signed dev cert (CN=GitNest Dev Test) is for sideload testing ONLY.
#
# Examples:
#   powershell -ExecutionPolicy Bypass -File scripts\sign-release.ps1 -CertSubject "CN=GitNest Dev Test"
#   $env:GITNEST_PFX_PASS='...'; powershell -ExecutionPolicy Bypass -File scripts\sign-release.ps1 -PfxPath certs\release.pfx
#
# ASCII-only on purpose (PS5 reads .ps1 with the ANSI codepage).
param(
  [string]$CertSubject,
  [string]$PfxPath,
  [string]$PfxPassword = $env:GITNEST_PFX_PASS,
  [string]$Timestamp = 'http://timestamp.digicert.com',
  [string[]]$Target,
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'

function Find-SignTool {
  $cache = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
  $candidates = @()
  if (Test-Path $cache) {
    $candidates += Get-ChildItem $cache -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  }
  $candidates += Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  $c = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($c) { $candidates += $c.Source }
  $found = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $found) { throw 'signtool.exe not found (install Windows SDK or build once to populate electron-builder cache)' }
  return $found
}

# default targets: NSIS installer + portable exe + unpacked app exe
if (-not $Target -or $Target.Count -eq 0) {
  $Target = @()
  $Target += Get-ChildItem $release -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  $unp = Join-Path $release 'win-unpacked\GitNest.exe'
  if (Test-Path $unp) { $Target += $unp }
}
$Target = $Target | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
if (-not $Target) { throw "no .exe targets found under $release ; run build:win first" }

if (-not $CertSubject -and -not $PfxPath) {
  throw 'specify -CertSubject "CN=..." or -PfxPath <file> (PFX password via $env:GITNEST_PFX_PASS or -PfxPassword)'
}

$signtool = Find-SignTool
Write-Host "signtool: $signtool"
Write-Host ("targets: " + ($Target.Count))

foreach ($t in $Target) {
  $args = @('sign', '/fd', 'sha256', '/tr', $Timestamp, '/td', 'sha256')
  if ($PfxPath) {
    $args += @('/f', $PfxPath)
    if ($PfxPassword) { $args += @('/p', $PfxPassword) }
  } else {
    $args += @('/n', $CertSubject)
  }
  $args += $t
  if ($WhatIf) { Write-Host ("[whatif] " + ($args -join ' ')); continue }
  Write-Host "signing: $t"
  & $signtool @args
  if ($LASTEXITCODE -ne 0) { throw "signtool sign failed ($LASTEXITCODE): $t" }
  & $signtool verify /pa $t | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "WARN: verify /pa failed (self-signed cert is expected to warn on an untrusted root): $t" }
  else { Write-Host "verified: $t" }
}
Write-Host 'DONE'
