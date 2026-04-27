# HR System - Auto-start on Windows boot
# Run this once as Administrator to register the scheduled task

$taskName   = "HR-System-PM2"
$scriptPath = "$PSScriptRoot\start-hr.ps1"

# Create the launcher script next to this file
$launcher = @'
Set-Location "C:\Users\smart\Desktop\hr مبسط"
$pm2 = "$env:APPDATA\npm\pm2.cmd"
& $pm2 resurrect
'@
Set-Content -Path (Join-Path $PSScriptRoot "start-hr.ps1") -Value $launcher -Encoding UTF8

# Register the scheduled task
$action    = New-ScheduledTaskAction  -Execute "powershell.exe" `
                                      -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest

Register-ScheduledTask -TaskName $taskName `
                       -Action $action `
                       -Trigger $trigger `
                       -Settings $settings `
                       -Principal $principal `
                       -Force | Out-Null

Write-Host "✅ Scheduled task '$taskName' created — PM2 will start automatically at login."
Write-Host "   To test: schtasks /run /tn $taskName"
