param(
  [string]$InstallDir = "$env:ProgramData\HRLocalAgent",
  [string]$TaskName = "HRLocalAgent",
  [switch]$StartNow,
  [switch]$PerUser
)

$ErrorActionPreference = 'Stop'

function Write-Section([string]$title) {
  Write-Host ""
  Write-Host "== $title ==" -ForegroundColor Cyan
}

function Test-IsAdmin {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-IsAdmin
if (-not $isAdmin -or $PerUser) {
  $PerUser = $true
  if ($InstallDir -eq "$env:ProgramData\HRLocalAgent") {
    $InstallDir = "$env:LOCALAPPDATA\HRLocalAgent"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceExe = Join-Path $projectRoot 'dist\hr-local-agent.exe'
$sourceEnvExample = Join-Path $projectRoot '.env.example'

if (-not (Test-Path $sourceExe)) {
  throw "Missing exe: $sourceExe. Run scripts\build-hr-agent-exe.ps1 first."
}

Write-Section 'Preparing install directory'
if (-not (Test-Path $InstallDir)) {
  New-Item -Path $InstallDir -ItemType Directory | Out-Null
}

$targetExe = Join-Path $InstallDir 'hr-local-agent.exe'
$targetEnv = Join-Path $InstallDir '.env'

$launchExeName = 'hr-local-agent.exe'
try {
  Copy-Item $sourceExe $targetExe -Force
} catch {
  $suffix = Get-Date -Format 'yyyyMMdd-HHmmss'
  $launchExeName = "hr-local-agent-$suffix.exe"
  $fallbackTarget = Join-Path $InstallDir $launchExeName
  Copy-Item $sourceExe $fallbackTarget -Force
}
if (-not (Test-Path $targetEnv)) {
  if (Test-Path $sourceEnvExample) {
    Copy-Item $sourceEnvExample $targetEnv
  } else {
    New-Item -Path $targetEnv -ItemType File | Out-Null
  }
}

Write-Section 'Registering startup scheduled task'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedInstallDir = $InstallDir.Replace('"', '""')
$runCommand = "Set-Location -LiteralPath ""$escapedInstallDir""; & .\$launchExeName *>> .\agent-runtime.log"
$encodedRunCommand = $runCommand.Replace('"', '""')

$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""$encodedRunCommand"""
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$runLevel = if ($PerUser) { 'Limited' } else { 'Highest' }
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel $runLevel
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null

Write-Host "Installed to: $InstallDir" -ForegroundColor Green
Write-Host "Task name: $TaskName" -ForegroundColor Green
Write-Host "Config file: $targetEnv" -ForegroundColor Yellow

if ($StartNow) {
  Write-Section 'Starting task now'
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host ''
Write-Host 'Done. Edit .env values in install directory, then run:' -ForegroundColor Green
Write-Host "Start-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor Green
