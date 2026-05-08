param(
  [string]$InstallDir = $PSScriptRoot,
  [string]$TaskName = 'HRLocalAgent',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

$exePath = Join-Path $InstallDir 'hr-local-agent.exe'
$envPath = Join-Path $InstallDir '.env'
$envExamplePath = Join-Path $InstallDir '.env.example'

if (-not (Test-Path $exePath)) {
  throw "Missing executable: $exePath"
}

if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
  Copy-Item $envExamplePath $envPath -Force
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedInstallDir = $InstallDir.Replace('"', '""')
$runCommand = "Set-Location -LiteralPath ""$escapedInstallDir""; & .\hr-local-agent.exe *>> .\agent-runtime.log"
$encodedRunCommand = $runCommand.Replace('"', '""')

$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""$encodedRunCommand"""
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Task registered: $TaskName" -ForegroundColor Green
