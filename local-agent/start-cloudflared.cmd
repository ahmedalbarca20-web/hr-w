@echo off
setlocal
REM One-time: set CLOUDFLARED_TUNNEL_TOKEN (User env or this file's folder .env is NOT auto-loaded here).
REM Prefer: cloudflared service install (token from Cloudflare Zero Trust) — then no need for this script.
if "%CLOUDFLARED_TUNNEL_TOKEN%"=="" (
  echo ERROR: Set environment variable CLOUDFLARED_TUNNEL_TOKEN ^(tunnel run token from Cloudflare^).
  echo Or install the Windows service: cloudflared.exe service install
  exit /b 1
)
set "CF_EXE=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" set "CF_EXE=%ProgramFiles%\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" (
  echo ERROR: cloudflared.exe not found under Program Files.
  exit /b 1
)
"%CF_EXE%" tunnel run --token %CLOUDFLARED_TUNNEL_TOKEN%
