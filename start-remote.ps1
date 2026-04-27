<#
.SYNOPSIS
    يشغّل نظام HR مع نفق Cloudflare للوصول عن بعد مجاناً
.DESCRIPTION
    يبدأ الباك-إند (port 5000) والفرونت-إند (port 3000) ثم يفتح نفق Cloudflare.
    يحدّث CORS تلقائياً بالـURL الجديد.
#>

$ROOT     = Split-Path -Parent $MyInvocation.MyCommand.Path
$CF       = "$env:USERPROFILE\cloudflared.exe"
$LOG      = "$env:TEMP\cf-tunnel.log"
$BACKEND  = "$ROOT\backend"
$FRONTEND = "$ROOT\frontend"
$ENV_FILE = "$BACKEND\.env"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   HR System - Remote Access Launcher   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── تنزيل cloudflared إن لم يكن موجوداً ───────────────────────────────
if (-not (Test-Path $CF)) {
    Write-Host "`n[1/4] Downloading cloudflared..." -ForegroundColor Yellow
    $dlUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $dlUrl -OutFile $CF -UseBasicParsing
    Write-Host "      Done." -ForegroundColor Green
} else {
    Write-Host "[1/4] cloudflared OK" -ForegroundColor Green
}

# ── إيقاف أي عمليات سابقة ─────────────────────────────────────────────
Write-Host "[2/4] Stopping previous instances..." -ForegroundColor Yellow
Get-Job -Name "backend","frontend" -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# ── تشغيل الباك-إند ───────────────────────────────────────────────────
Write-Host "[3/4] Starting backend (port 5000)..." -ForegroundColor Yellow
Start-Job -Name "backend" -ScriptBlock {
    Set-Location $using:BACKEND
    node server.js 2>&1
} | Out-Null
Start-Sleep -Seconds 6
$backendOK = netstat -ano | Select-String "TCP.*:5000.*LISTENING"
if ($backendOK) {
    Write-Host "      Backend running on port 5000" -ForegroundColor Green
} else {
    Write-Host "      WARNING: Backend may not have started yet" -ForegroundColor Red
}

# ── تشغيل الفرونت-إند ─────────────────────────────────────────────────
Write-Host "[3/4] Starting frontend (port 3000)..." -ForegroundColor Yellow
Start-Job -Name "frontend" -ScriptBlock {
    Set-Location $using:FRONTEND
    npm run dev 2>&1
} | Out-Null
Start-Sleep -Seconds 8
$frontendOK = netstat -ano | Select-String "TCP.*:3000.*LISTENING"
if ($frontendOK) {
    Write-Host "      Frontend running on port 3000" -ForegroundColor Green
} else {
    Write-Host "      WARNING: Frontend may not have started yet" -ForegroundColor Red
}

# ── تشغيل النفق وقراءة الـURL ─────────────────────────────────────────
Write-Host "[4/4] Opening Cloudflare Tunnel..." -ForegroundColor Yellow
Remove-Item $LOG -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $CF -ArgumentList "tunnel","--url","http://localhost:3000" -RedirectStandardError $LOG -WindowStyle Hidden
Start-Sleep -Seconds 12

# قراءة الـURL من اللوج
$urlLine = Get-Content $LOG -ErrorAction SilentlyContinue | Select-String "trycloudflare\.com" | Select-Object -First 1
if ($urlLine -match "(https://[^\s]+trycloudflare\.com)") {
    $PublicURL = $Matches[1]
} else {
    $PublicURL = $null
}

if ($PublicURL) {
    # تحديث CORS في .env
    Write-Host "      Updating CORS in backend .env..." -ForegroundColor Yellow
    $envContent    = Get-Content $ENV_FILE -Raw
    $currentOrigin = ($envContent | Select-String "CLIENT_URL=(.+)").Matches[0].Groups[1].Value.Trim()
    if (-not ($currentOrigin -like "*$PublicURL*")) {
        $newOrigins   = $currentOrigin + ",$PublicURL"
        $envContent   = $envContent -replace "CLIENT_URL=.+", "CLIENT_URL=$newOrigins"
        Set-Content $ENV_FILE -Value $envContent -NoNewline
        # إعادة تشغيل الباك-إند
        Get-Job -Name "backend" | Remove-Job -Force
        Start-Sleep -Seconds 1
        Start-Job -Name "backend" -ScriptBlock {
            Set-Location $using:BACKEND
            node server.js 2>&1
        } | Out-Null
        Start-Sleep -Seconds 6
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  النظام شغّال وجاهز للوصول عن بُعد!   " -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Public URL:"    -ForegroundColor White
    Write-Host "  $PublicURL"     -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Local URLs:"    -ForegroundColor White
    Write-Host "  Frontend : http://localhost:3000"    -ForegroundColor Gray
    Write-Host "  Backend  : http://localhost:5000/api/health" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  NOTE: URL changes every time you restart the tunnel." -ForegroundColor Yellow
    Write-Host "        For a fixed URL, create a free Cloudflare account." -ForegroundColor Yellow
    Write-Host ""

    # فتح المتصفح
    Start-Process $PublicURL
} else {
    Write-Host "  Could not detect public URL from tunnel log." -ForegroundColor Red
    Write-Host "  Check log: $LOG" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Servers are running:" -ForegroundColor Yellow
    Write-Host "  Frontend : http://localhost:3000"
    Write-Host "  Backend  : http://localhost:5000/api/health"
}

Write-Host "Press any key to stop all services and exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# إيقاف كل شيء
Write-Host "Stopping all services..." -ForegroundColor Yellow
Get-Job -Name "backend","frontend" | Remove-Job -Force
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
