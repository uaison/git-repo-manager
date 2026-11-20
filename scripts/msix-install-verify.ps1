# One-shot sideload install/verify for the Git Repo Manager MSIX on a NORMAL Windows 11 machine.
#
# Why a script: the dev machine used to build this package is a trimmed Windows image
# with no Msixvc service, so Add-AppxPackage hangs there. Run this on a normal Win11.
#
# What it does:
#   1. (admin) trust the public dev cert into LocalMachine\Root + TrustedPeople
#   2. (admin) enable sideloading (AllowAllTrustedApps = 1)
#   3. Add-AppxPackage the .msix
#   4. confirm via Get-AppxPackage, then launch the app
#   5. (-Uninstall) remove it again
#
# NOTE: ASCII-only on purpose. Windows PowerShell 5 reads .ps1 using the system ANSI
# codepage; UTF-8 Chinese without a BOM gets mangled and breaks the parser.
#
# Usage (elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\msix-install-verify.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\msix-install-verify.ps1 -Uninstall
param(
  [string]$MsixPath,
  [string]$CerPath,
  [switch]$Uninstall,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $MsixPath) { $MsixPath = Join-Path $root 'release\Git Repo Manager 1.0.0.msix' }
if (-not $CerPath)  { $CerPath  = Join-Path $root 'certs\GitRepoManagerDev.cer' }
$pkgName = 'uaison.GitRepoManager'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Uninstall) {
  Write-Host '=== Remove-AppxPackage ==='
  Get-AppxPackage -Name $pkgName -ErrorAction SilentlyContinue | Remove-AppxPackage
  $still = Get-AppxPackage -Name $pkgName -ErrorAction SilentlyContinue
  Write-Host ('still installed: ' + [bool]$still)
  return
}

$isAdmin = Test-Admin
Write-Host ('elevated: ' + $isAdmin)

# 1) trust cert (needs admin for LocalMachine stores)
if (Test-Path $CerPath) {
  if ($isAdmin) {
    Write-Host '=== trust cert into LocalMachine Root + TrustedPeople ==='
    & certutil -addstore -f Root $CerPath | Out-Null
    & certutil -addstore -f TrustedPeople $CerPath | Out-Null
    Write-Host 'cert trusted'
  } else {
    Write-Host 'WARN: not elevated; skip LocalMachine trust. Re-run as admin if install fails with 0x800B0109.'
  }
} else {
  Write-Host ("WARN: cert not found at $CerPath ; trust it manually if needed")
}

# 2) enable sideload (needs admin)
if ($isAdmin) {
  $k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
  Set-ItemProperty -Path $k -Name AllowAllTrustedApps -Value 1 -Type DWord -Force
  Write-Host 'sideload enabled (AllowAllTrustedApps=1)'
}

# 3) install
if (-not (Test-Path $MsixPath)) { throw "MSIX not found: $MsixPath" }
Write-Host '=== Add-AppxPackage ==='
Get-AppxPackage -Name $pkgName -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue
Add-AppxPackage -Path $MsixPath -ForceApplicationShutdown

# 4) confirm + launch
$pkg = Get-AppxPackage -Name $pkgName
if (-not $pkg) { throw 'install reported success but package not found' }
Write-Host '=== installed ==='
$pkg | Select-Object Name, PackageFullName, Version, InstallLocation | Format-List

if (-not $NoLaunch) {
  $aumid = "$($pkg.PackageFamilyName)!GitRepoManager"
  Write-Host "=== launch: shell:AppsFolder\$aumid ==="
  Start-Process "shell:AppsFolder\$aumid"
  Write-Host 'launched. Verify the window renders, then re-run with -Uninstall to clean up.'
}
Write-Host 'DONE'
