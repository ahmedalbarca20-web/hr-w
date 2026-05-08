@echo off
REM Run ONCE as Administrator.
REM Token: Cloudflare Zero Trust ^> Networks ^> Tunnels ^> tunnel ^> Install connector.
setlocal
set "TOK=%~1"
if "%TOK%"=="" set "TOK=%CLOUDFLARED_TUNNEL_TOKEN%"
if "%TOK%"=="" (
  echo Usage ^(Admin CMD^): install-cloudflared-windows-service.cmd YOUR_TUNNEL_TOKEN
  echo Or set CLOUDFLARED_TUNNEL_TOKEN then run without arguments.
  exit /b 1
)
set "CF_EXE=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" set "CF_EXE=%ProgramFiles%\cloudflared\cloudflared.exe"
if not exist "%CF_EXE%" (
  echo Install cloudflared from Cloudflare first.
  exit /b 1
)
"%CF_EXE%" service install "%TOK%"
"%CF_EXE%" service start
echo.
echo Check: sc query cloudflared
endlocal
