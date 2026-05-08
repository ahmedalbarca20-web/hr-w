# Run once (normal user). Creates a logon scheduled task: pm2 resurrect for zk-agent.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ResurrectCmd = Join-Path $PSScriptRoot 'pm2-resurrect.cmd'
Set-Location $Root

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm not in PATH. Install Node.js LTS first.'
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  npm install -g pm2
  if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { Write-Error 'pm2 not found after global install.' }
}

npm install --omit=dev 2>$null
& pm2 start "$Root\ecosystem.config.cjs"
& pm2 save

$taskName = 'HR-LocalAgent-PM2-Resurrect'
schtasks /Delete /TN $taskName /F 2>$null | Out-Null
schtasks /Create /TN $taskName /TR "`"$ResurrectCmd`"" /SC ONLOGON /RL HIGHEST /F | Out-Null

Write-Host "Done. Task '$taskName' runs at logon: $ResurrectCmd"
Write-Host "Verify: pm2 status — then reboot and run pm2 status again."
