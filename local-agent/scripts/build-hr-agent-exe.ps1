param(
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if ($Clean -and (Test-Path '.\dist')) {
  Remove-Item '.\dist' -Recurse -Force
}

if (-not (Test-Path '.\dist')) {
  New-Item -ItemType Directory -Path '.\dist' | Out-Null
}

Write-Host 'Installing dependencies...' -ForegroundColor Cyan
npm install

Write-Host 'Building Windows exe with pkg...' -ForegroundColor Cyan
npm run build:exe

if (-not (Test-Path '.\dist\hr-local-agent.exe')) {
  throw 'Build failed: dist\hr-local-agent.exe was not created.'
}

Write-Host 'Build complete: dist\hr-local-agent.exe' -ForegroundColor Green
