param(
  [switch]$SkipNodeInstall,
  [switch]$SkipTailscale
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Section($title) {
  Write-Host ''
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Write-Success($msg) {
  Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Error-Custom($msg) {
  Write-Host "✗ $msg" -ForegroundColor Red
}

Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║        HR System Local Agent - Complete Installation           ║
║                                                                ║
║  This installer will set up:                                  ║
║  • Tailscale VPN (secure mesh network)                        ║
║  • Node.js runtime                                            ║
║  • Local Agent (fingerprint device connector)                 ║
║  • Windows Services (auto-start)                              ║
║                                                                ║
║  After installation, the device will be reachable from        ║
║  Vercel without exposing it to the public internet.           ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Yellow

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([System.Security.Principal.WindowsPrincipal]$currentUser).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Error-Custom "This installer must run as Administrator."
  Write-Host "Please right-click PowerShell and select 'Run as administrator'."
  exit 1
}

Write-Section "Installing Tailscale VPN"

if (-not $SkipTailscale) {
  try {
    $tailscaleCmd = Get-Command tailscale -ErrorAction Stop
    Write-Success "Tailscale already installed: $($tailscaleCmd.Source)"
  } catch {
    Write-Host "Downloading Tailscale..."
    $tsUrl = "https://pkgs.tailscale.com/windows/tailscale-setup-latest.exe"
    $tsInstaller = "$env:TEMP\tailscale-setup.exe"
    
    try {
      Invoke-WebRequest -Uri $tsUrl -OutFile $tsInstaller -UseBasicParsing -TimeoutSec 60
      Write-Host "Starting Tailscale installation..."
      & $tsInstaller /install-driver=wintun /unattend
      Start-Sleep -Seconds 10
      Write-Success "Tailscale installed"
    } catch {
      Write-Error-Custom "Failed to install Tailscale: $_"
      Write-Host "You can install it manually from https://tailscale.com/download"
    }
  }
}

Write-Section "Installing Node.js"

if (-not $SkipNodeInstall) {
  try {
    $nodeCmd = Get-Command node -ErrorAction Stop
    $nodeVersion = & node --version
    Write-Success "Node.js already installed: $nodeVersion at $($nodeCmd.Source)"
  } catch {
    Write-Host "Downloading Node.js LTS..."
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-setup.msi"
    
    try {
      Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing -TimeoutSec 120
      Write-Host "Starting Node.js installation..."
      & msiexec.exe /i $nodeInstaller /quiet /norestart
      Start-Sleep -Seconds 20
      $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
      Write-Success "Node.js installed"
    } catch {
      Write-Error-Custom "Failed to install Node.js: $_"
      exit 1
    }
  }
}

Write-Section "Setting up Local Agent"

$agentDir = Split-Path -Parent $PSScriptRoot
Set-Location $agentDir

if (-not (Test-Path '.\.env')) {
  if (Test-Path '.\.env.example') {
    Copy-Item '.\.env.example' '.\.env'
    Write-Success ".env created from .env.example"
  } else {
    Write-Error-Custom ".env.example not found at $agentDir"
    exit 1
  }
}

Write-Host "Installing npm dependencies..."
npm install --production

Write-Success "Local Agent dependencies installed"

Write-Section "Installing PM2 (auto-restart service)"

try {
  $pm2Cmd = Get-Command pm2 -ErrorAction Stop
  Write-Success "PM2 already installed: $($pm2Cmd.Source)"
} catch {
  Write-Host "Installing PM2 globally..."
  npm install -g pm2
  Write-Success "PM2 installed"
}

Write-Section "Starting Local Agent service"

$env:LOCAL_AGENT_TOKEN = (Select-String -Path '.\.env' -Pattern '^LOCAL_AGENT_TOKEN=(.*)$' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() })

if (-not $env:LOCAL_AGENT_TOKEN) {
  Write-Error-Custom "LOCAL_AGENT_TOKEN is missing in .env"
  exit 1
}

pm2 start server.js --name "hr-local-agent" --namespace "hr" --env production
pm2 save

Write-Success "Local Agent started with PM2"

Write-Section "Registering Windows startup task"

Push-Location 'scripts'
try {
  & powershell -ExecutionPolicy Bypass -File .\install-windows-pm2-logon.ps1
  Write-Success "Windows startup task registered"
} catch {
  Write-Error-Custom "Failed to register startup task: $_"
} finally {
  Pop-Location
}

Write-Section "Installation complete!"

Write-Host @"

✓ Your HR Local Agent is now installed and running!

Next steps:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Start Tailscale:
   
   tailscale up
   
   (Follow the link to connect your account)

2. After Tailscale connects, run:
   
   tailscale ip -4
   
   This will show your Tailscale IP (like 100.x.x.x)

3. Contact admin to add this Tailscale IP to Vercel:
   
   Set LOCAL_AGENT_URL = http://<your-tailscale-ip>:8099
   
   Example: http://100.64.1.50:8099

4. Test the connection:
   
   curl http://127.0.0.1:8099/health

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent logs:
  pm2 logs hr-local-agent

Status:
  pm2 status

Restart (if needed):
  pm2 restart hr-local-agent

Disable on restart:
  pm2 delete hr-local-agent

"@ -ForegroundColor Green
