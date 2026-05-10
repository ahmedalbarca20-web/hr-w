#Requires -RunAsAdministrator
<#
  Production Windows service using sc.exe (no Node required on the PC after install).
  Usage:
    .\install-service-sc.ps1 -InstallPath "C:\Program Files\AttendanceAgent"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $InstallPath
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $InstallPath "AttendanceAgent.exe"
if (-not (Test-Path $exe)) {
  Write-Error "AttendanceAgent.exe not found at $exe"
}

$svcName = "AttendanceAgent"
$binQuoted = "`"$exe`""

$existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq 'Running') { Stop-Service -Name $svcName -Force }
  sc.exe delete $svcName | Out-Null
  Start-Sleep -Seconds 2
}

sc.exe create $svcName binPath= $binQuoted start= auto DisplayName= "Attendance Agent (HR ZK)" | Out-Null
sc.exe description $svcName "Outbound polling agent for ZKTeco devices — talks to cloud API only." | Out-Null

New-Item -ItemType Directory -Force -Path "$env:ProgramData\AttendanceAgent\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:ProgramData\AttendanceAgent" | Out-Null

Start-Service -Name $svcName
Write-Host "Service $svcName installed and started."
