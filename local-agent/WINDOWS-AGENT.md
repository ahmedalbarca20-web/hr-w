# Windows Attendance Agent (outbound polling)

## Architecture

- **Office PC** runs `polling-agent.js`: outbound HTTPS only to your API (`GET /api/agent/jobs`, `POST /api/agent/job-result`, `POST /api/agent/heartbeat`).
- **Cloud API** never connects inbound to the office; it **queues jobs in the database** for each `agent_id`.
- **HR browser** (Vercel) calls authenticated routes; the API **enqueues work** and waits until the office agent completes it (or use legacy `LOCAL_AGENT_URL` tunnel).

## Cloud configuration (Vercel / API `.env`)

| Variable | Purpose |
|----------|---------|
| `AGENT_SHARED_TOKEN` | Same secret as on the agent; `Authorization: Bearer …` |
| `ALLOWED_AGENT_IDS` | Comma list, e.g. `office_1` |
| `AGENT_RELAY_DEFAULT_ID` | Default `agent_id` when the UI does not pass one (single-office deploys) |
| `DISABLE_LOCAL_AGENT_URL=1` | Force **no** inbound tunnel; queue-only relay |
| *(optional legacy)* `LOCAL_AGENT_URL` + `LOCAL_AGENT_TOKEN` | Tunnel to agent HTTP `/execute` |

## Frontend (Vercel)

Set `VITE_AGENT_ID` to the same string as `AGENT_ID` on the office PC (e.g. `office_1`).

## Local agent configuration

### Option A — `.env` next to `polling-agent.js`

See `.env.example`.

### Option B — JSON (installer)

Default path: `%ProgramData%\AttendanceAgent\config.json`

```json
{
  "backend_url": "https://your-app.vercel.app/api",
  "agent_id": "office_1",
  "company_id": 1,
  "token": "same-as-AGENT_SHARED_TOKEN",
  "poll_interval_ms": 3000,
  "heartbeat_interval_ms": 60000
}
```

Environment variables **override** file values when set.

## Resilience (agent)

- Poll interval default **3s** (`POLL_INTERVAL_MS`).
- Heartbeat default **60s** (`HEARTBEAT_INTERVAL_MS`, `POST /api/agent/heartbeat`).
- Exponential backoff on poll errors (up to 60s).
- Failed `job-result` posts are stored in `%ProgramData%\AttendanceAgent\pending-job-results.json` and retried.

## Windows Service (production — no Node on the office PC)

The packaged executable registers as a Windows service via `sc.exe` (see `scripts/install-service-sc.ps1`). The **Inno Setup** installer runs activation and installs the service automatically.

### Developer-only (repo checkout with Node)

```powershell
cd C:\Path\To\local-agent
npm ci
$env:ATTENDANCE_AGENT_EXE = "$(Resolve-Path .\dist\AttendanceAgent.exe)"
npm run install-service
```

Or use `node install-windows-service.js` with `ATTENDANCE_AGENT_EXE` pointing at `dist\AttendanceAgent.exe` after `npm run build-agent`.

Uninstall (elevated): stop the service, then `sc delete AttendanceAgent`, or use the installer uninstaller.

## Installer (Inno Setup)

1. On a build machine: `cd local-agent` then `npm run build-agent` (produces `dist\AttendanceAgent.exe`).
2. Install [Inno Setup 6](https://jrsoftware.org/isinfo.php).
3. Open `installer\setup.iss` and compile (or run `ISCC.exe installer\setup.iss` from the `local-agent` folder).

Output: `installer\dist\AttendanceAgentSetup.exe`. The wizard collects **API base URL** and **activation code**, calls `AttendanceAgent.exe --activate … --api-base …` (writes `%ProgramData%\AttendanceAgent\config.json`), then runs `install-service-sc.ps1` to create and start the **AttendanceAgent** service.

**Silent install:** `AttendanceAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /APIBASE=https://host/api /ACTIVATION=OFFICE-ABCD-1234`

## Migration from `LOCAL_AGENT_URL` (inbound tunnel)

1. Deploy Windows agent on the LAN PC with `AGENT_ID` / `AGENT_SHARED_TOKEN` / `CLOUD_API_BASE_URL`.
2. Set `AGENT_RELAY_DEFAULT_ID` on the API to that `AGENT_ID`.
3. Set `DISABLE_LOCAL_AGENT_URL=1` and remove `LOCAL_AGENT_URL` / `LOCAL_AGENT_TOKEN` when ready.
4. Set `VITE_AGENT_ID` on the frontend.

## Supported job actions (today)

`probe`, `zk_probe_snapshot`, `list_users`, `pull_attendance`, `unlock_device`, `set_user_privilege`.  
Additional actions (restart device, push/delete user, etc.) require extending `POLLABLE_ACTIONS` on the API, job payloads, and `local-agent/server.js` `/execute`.
