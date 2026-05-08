# HR Local Agent EXE Quick Start

This guide packages the LAN polling agent as a single Windows executable and installs it for auto-start.

## Fastest (one command)

From `local-agent`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-hr-agent-exe-oneclick.ps1
```

This does all steps:

- build `dist\hr-local-agent.exe`
- install into `%LOCALAPPDATA%\HRLocalAgent` (per-user)
- create/update Scheduled Task `HRLocalAgent`
- start task immediately

## Build real Setup.exe (installer wizard)

From `local-agent`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-setup-exe.ps1
```

This will:

- build `dist\hr-local-agent.exe`
- install Inno Setup automatically (via `winget`) if missing
- produce installer: `dist\HR-Local-Agent-Setup.exe`

Then distribute/run:

```powershell
.\dist\HR-Local-Agent-Setup.exe
```

Installer behavior:

- installs to `%LOCALAPPDATA%\HRLocalAgent`
- creates `.env` from `.env.example` (if missing)
- registers and starts Scheduled Task `HRLocalAgent`

## Manual flow

## 1) Build executable

From `local-agent`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-hr-agent-exe.ps1
```

Expected output file:

- `local-agent\dist\hr-local-agent.exe`

## 2) Install executable on machine

Recommended (no admin needed, per-user):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-hr-agent-exe.ps1 -PerUser -StartNow
```

Alternative (Administrator, machine-wide):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-hr-agent-exe.ps1 -StartNow
```

Installer actions:

- copies exe to `%LOCALAPPDATA%\HRLocalAgent` (per-user default) or `C:\ProgramData\HRLocalAgent` (admin mode)
- creates `.env` in the same folder from `.env.example` (first install only)
- registers a Scheduled Task (`HRLocalAgent`) to auto-run at user logon

## 3) Configure environment

Edit:

- `%LOCALAPPDATA%\HRLocalAgent\.env` (per-user)
- or `C:\ProgramData\HRLocalAgent\.env` (admin mode)

Required values for polling mode:

- `CLOUD_API_BASE_URL`
- `AGENT_ID`
- `AGENT_SHARED_TOKEN`

Optional:

- `LOCAL_AGENT_PORT` (default `8099`)
- `POLL_INTERVAL_MS` (default `2000`)

Backend side must also include:

- `AGENT_SHARED_TOKEN` (same value as agent)
- `ALLOWED_AGENT_IDS` (must include your `AGENT_ID`, e.g. `office_1`)

## 4) Validate

```powershell
curl http://127.0.0.1:8099/health
```

If needed, manually start task:

```powershell
Start-ScheduledTask -TaskName "HRLocalAgent"
```

Check task status:

```powershell
schtasks /Query /TN "HRLocalAgent" /V /FO LIST
```
