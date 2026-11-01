#!/usr/bin/env pwsh
<#
 .SYNOPSIS
    HR System - Local-Only Quick Start (بدون سحابة)
 .DESCRIPTION
    Starts all services in local-only mode without cloud dependencies
#>

$ErrorActionPreference = "Stop"
$RepoPath = $PSScriptRoot

Set-Location $RepoPath

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  HR System - Local-Only Mode Startup                     ║" -ForegroundColor Cyan
Write-Host "║                      (كل شيء محلي بدون سحابة)                           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check PM2
Write-Host "[1/4] Checking PM2 installation..." -ForegroundColor Yellow
$pm2 = pm2 -v 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ PM2 not found. Installing globally..." -ForegroundColor Red
    npm install -g pm2 | Out-Null
    Write-Host "✓ PM2 installed" -ForegroundColor Green
} else {
    Write-Host "✓ PM2 is installed ($pm2)" -ForegroundColor Green
}

# Step 2: Install dependencies
Write-Host ""
Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow

Write-Host "  - Backend dependencies" -ForegroundColor Cyan
Set-Location "$RepoPath\backend"
npm install --silent | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Backend install failed" -ForegroundColor Red
    exit 1
}

Write-Host "  - Frontend dependencies" -ForegroundColor Cyan
Set-Location "$RepoPath\frontend"
npm install --silent | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Frontend install failed" -ForegroundColor Red
    exit 1
}

Write-Host "  - Local-Agent dependencies" -ForegroundColor Cyan
Set-Location "$RepoPath\local-agent"
npm install --silent | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Local-Agent install failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ All dependencies installed" -ForegroundColor Green

# Step 3: Verify configuration
Write-Host ""
Write-Host "[3/4] Verifying configuration files..." -ForegroundColor Yellow

$configFiles = @(
    "$RepoPath\backend\.env",
    "$RepoPath\local-agent\.env",
    "$RepoPath\ecosystem.config.js"
)

foreach ($file in $configFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "✗ Missing: $file" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✓ Configuration files found" -ForegroundColor Green

# Step 4: Start services
Write-Host ""
Write-Host "[4/4] Starting services with PM2..." -ForegroundColor Yellow

Set-Location $RepoPath

# Clean up existing PM2 apps
pm2 delete "hr-backend" "hr-frontend" "zk-agent" 2>$null | Out-Null

# Start services
pm2 start ecosystem.config.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to start services" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Services started" -ForegroundColor Green

# Display status
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                      ✓ Startup Complete!                                 ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Green

Write-Host "║ Services running:                                                         ║" -ForegroundColor Green
Write-Host "║  • Backend API: http://localhost:5000/api/health                          ║" -ForegroundColor Green
Write-Host "║  • Frontend UI:  http://localhost:3000                                    ║" -ForegroundColor Green
Write-Host "║  • ZK Agent:     http://127.0.0.1:8099                                    ║" -ForegroundColor Green

Write-Host "╠═══════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║ Commands:                                                                  ║" -ForegroundColor Green
Write-Host "║  pm2 status        - Show service status                                  ║" -ForegroundColor Green
Write-Host "║  pm2 logs          - View all logs                                        ║" -ForegroundColor Green
Write-Host "║  pm2 logs hr-backend - View backend logs                                  ║" -ForegroundColor Green
Write-Host "║  pm2 logs zk-agent - View agent logs                                      ║" -ForegroundColor Green
Write-Host "║  pm2 stop all      - Stop all services                                    ║" -ForegroundColor Green
Write-Host "║  pm2 restart all   - Restart all services                                 ║" -ForegroundColor Green
Write-Host "║  pm2 delete all    - Remove from PM2                                      ║" -ForegroundColor Green

Write-Host "╠═══════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║ Next Steps:                                                                ║" -ForegroundColor Green
Write-Host "║  1. Open: http://localhost:3000                                           ║" -ForegroundColor Green
Write-Host "║  2. Login with your credentials                                           ║" -ForegroundColor Green
Write-Host "║  3. Go to Devices to add ZK device                                        ║" -ForegroundColor Green
Write-Host "║  4. Test connection and pull attendance                                   ║" -ForegroundColor Green
Write-Host "║                                                                            ║" -ForegroundColor Green
Write-Host "║ For troubleshooting, see: LOCAL-ONLY-SETUP.md                             ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Save PM2 config
pm2 save 2>$null | Out-Null
pm2 startup 2>$null | Out-Null

exit 0
