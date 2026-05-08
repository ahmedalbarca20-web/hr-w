param(
  [switch]$SkipPm2Install
)

$ErrorActionPreference = 'Stop'

function Write-Section([string]$title) {
  Write-Host ''
  Write-Host "== $title ==" -ForegroundColor Cyan
}

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Section 'Local Agent bootstrap'

if (-not (Test-Path '.\.env')) {
  if (Test-Path '.\.env.example') {
    Copy-Item '.\.env.example' '.\.env'
    Write-Host 'Created .env from .env.example.' -ForegroundColor Green
  } else {
    throw '.env.example not found.'
  }
}

if (-not $SkipPm2Install) {
  Write-Section 'Installing pm2 if needed'
  try {
    $pm2 = Get-Command pm2 -ErrorAction Stop
    Write-Host "pm2 found: $($pm2.Source)" -ForegroundColor Green
  } catch {
    npm install -g pm2
  }
}

Write-Section 'Installing local dependencies'
npm install

Write-Section 'Starting zk-agent'
$env:LOCAL_AGENT_TOKEN = (Select-String -Path '.\.env' -Pattern '^LOCAL_AGENT_TOKEN=(.*)$' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() })
if (-not $env:LOCAL_AGENT_TOKEN) {
  throw 'LOCAL_AGENT_TOKEN is missing in .env. Set it before starting the agent.'
}

pm2 start ecosystem.config.cjs
pm2 save

Write-Section 'Register login startup task'
Push-Location 'scripts'
try {
  powershell -ExecutionPolicy Bypass -File .\install-windows-pm2-logon.ps1
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Bootstrap complete. Run `pm2 status` or open `http://127.0.0.1:8099/health` to verify.' -ForegroundColor Green