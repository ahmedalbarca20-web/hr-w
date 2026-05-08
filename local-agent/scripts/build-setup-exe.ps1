param(
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$issPath = Join-Path $projectRoot 'installer\hr-local-agent.iss'

if (-not (Test-Path $issPath)) {
  throw "Missing Inno Setup script: $issPath"
}

Write-Host 'Step 1/3: Building agent executable...' -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-hr-agent-exe.ps1') @(
  if ($Clean) { '-Clean' }
)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Step 2/3: Locating Inno Setup compiler...' -ForegroundColor Cyan
$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if ($null -eq $iscc) {
  Write-Host 'Inno Setup not found. Installing via winget...' -ForegroundColor Yellow
  winget install --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements
  $iscc = Get-Command iscc -ErrorAction SilentlyContinue
}

if ($null -eq $iscc) {
  $commonPaths = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
  )
  $found = $commonPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($found) {
    $isccPath = $found
  } else {
    throw 'ISCC.exe was not found after installation. Reopen terminal and retry.'
  }
} else {
  $isccPath = $iscc.Source
}

Write-Host 'Step 3/3: Building Setup.exe...' -ForegroundColor Cyan
& $isccPath $issPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$setupPath = Join-Path $projectRoot 'dist\HR-Local-Agent-Setup.exe'
if (-not (Test-Path $setupPath)) {
  throw "Expected setup not found: $setupPath"
}

Write-Host "Build complete: $setupPath" -ForegroundColor Green
