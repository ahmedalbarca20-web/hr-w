param(
  [switch]$Clean,
  [switch]$PerUser = $true
)

$ErrorActionPreference = 'Stop'

$scriptsDir = $PSScriptRoot

Write-Host 'Step 1/2: Building executable...' -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir 'build-hr-agent-exe.ps1') @(
  if ($Clean) { '-Clean' }
)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Step 2/2: Installing and starting scheduled task...' -ForegroundColor Cyan
$installArgs = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $scriptsDir 'install-hr-agent-exe.ps1'), '-StartNow')
if ($PerUser) {
  $installArgs += '-PerUser'
}
powershell @installArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'One-click setup complete.' -ForegroundColor Green
