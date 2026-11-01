@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM HR System - Local-Only Quick Start (بدون سحابة)
REM ═══════════════════════════════════════════════════════════════════════════

setlocal enabledelayedexpansion

set "REPO_PATH=%~dp0"

cd /d "%REPO_PATH%"

echo.
echo ╔═══════════════════════════════════════════════════════════════════════════╗
echo ║                  HR System - Local-Only Mode Startup                     ║
echo ║                      (كل شيء محلي بدون سحابة)                           ║
echo ╚═══════════════════════════════════════════════════════════════════════════╝
echo.

echo [1/4] Checking PM2 installation...
pm2 -v >nul 2>&1
if errorlevel 1 (
    echo ✗ PM2 not found. Installing globally...
    npm install -g pm2
    echo ✓ PM2 installed
) else (
    echo ✓ PM2 is installed
)

echo.
echo [2/4] Installing dependencies...
echo   - Backend dependencies
cd /d "%REPO_PATH%\backend"
call npm install --silent
if errorlevel 1 (
    echo ✗ Backend install failed
    goto error
)

echo   - Frontend dependencies
cd /d "%REPO_PATH%\frontend"
call npm install --silent
if errorlevel 1 (
    echo ✗ Frontend install failed
    goto error
)

echo   - Local-Agent dependencies
cd /d "%REPO_PATH%\local-agent"
call npm install --silent
if errorlevel 1 (
    echo ✗ Local-Agent install failed
    goto error
)
echo ✓ All dependencies installed

echo.
echo [3/4] Verifying configuration files...
if not exist "%REPO_PATH%\backend\.env" (
    echo ✗ backend/.env not found
    goto error
)
if not exist "%REPO_PATH%\local-agent\.env" (
    echo ✗ local-agent/.env not found
    goto error
)
echo ✓ Configuration files found

echo.
echo [4/4] Starting services with PM2...
cd /d "%REPO_PATH%"

REM Clean up existing PM2 apps
pm2 delete hr-backend hr-frontend zk-agent 2>nul

REM Start services
pm2 start ecosystem.config.js
if errorlevel 1 (
    echo ✗ Failed to start services
    goto error
)

echo ✓ Services started

echo.
echo ╔═══════════════════════════════════════════════════════════════════════════╗
echo ║                      ✓ Startup Complete!                                 ║
echo ╠═══════════════════════════════════════════════════════════════════════════╣
echo ║ Services running:                                                         ║
echo ║  • Backend API: http://localhost:5000/api/health                          ║
echo ║  • Frontend UI:  http://localhost:3000                                    ║
echo ║  • ZK Agent:     http://127.0.0.1:8099                                    ║
echo ╠═══════════════════════════════════════════════════════════════════════════╣
echo ║ Commands:                                                                  ║
echo ║  pm2 status        - Show service status                                  ║
echo ║  pm2 logs          - View all logs                                        ║
echo ║  pm2 logs hr-backend - View backend logs                                  ║
echo ║  pm2 logs zk-agent - View agent logs                                      ║
echo ║  pm2 stop all      - Stop all services                                    ║
echo ║  pm2 restart all   - Restart all services                                 ║
echo ║  pm2 delete all    - Remove from PM2                                      ║
echo ╠═══════════════════════════════════════════════════════════════════════════╣
echo ║ Next Steps:                                                                ║
echo ║  1. Open: http://localhost:3000                                           ║
echo ║  2. Login with your credentials                                           ║
echo ║  3. Go to Devices to add ZK device                                        ║
echo ║  4. Test connection and pull attendance                                   ║
echo ║                                                                            ║
echo ║ For troubleshooting, see: LOCAL-ONLY-SETUP.md                             ║
echo ╚═══════════════════════════════════════════════════════════════════════════╝
echo.

REM Save PM2 config
pm2 save
pm2 startup

exit /b 0

:error
echo.
echo ✗ Startup failed. Check errors above.
exit /b 1
