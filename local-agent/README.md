# HR Local Agent (LAN polling bridge)

Node.js process on a **PC inside the same LAN as the ZKTeco device** (`192.168.x.x`).  
The cloud API (Vercel) cannot call private IPs directly, so this agent **polls** the cloud for jobs and executes them locally.

## Architecture (no tunnels, no public IP)

```text
Browser / SPA  →  Vercel API (/api/probe-device)
                    ↓
                Jobs queue (JSON / DB)
                    ↑
        Polling Agent on LAN PC (this project)
                    ↓
           ZKTeco device (192.168.x.x)
```

The agent **never exposes a public port** and does **not use Cloudflare Tunnel / ngrok / port‑forwarding**. It only makes **outgoing HTTPS requests** to the Vercel API.

## Behaviour

- `GET /health` — local health check on `http://127.0.0.1:8099/health` (no auth, for debugging).
- Polls `GET {CLOUD_API_BASE_URL}/agent/jobs?agent_id=...` every `POLL_INTERVAL_MS` (default 2000 ms).
- For each `probe` job, performs `http://192.168.x.x/cgi-bin/getoption.cgi?action=getoption&kind=SerialNumber` with:
  - `timeout: 800 ms` by default.
  - **One retry** on timeout only.
- Arabic / mojibake responses are decoded using `utf8`, `latin1`, `windows-1256` heuristics.
- Results are sent back to the cloud via `POST {CLOUD_API_BASE_URL}/agent/job-result`.

## Environment (.env)

From `local-agent` folder:

```bash
cd local-agent
npm install
copy .env.example .env
```

Then edit `.env`:

- `LOCAL_AGENT_TOKEN` — long random secret for local HTTP routes (used only if you call `POST /execute` directly).
- `CLOUD_API_BASE_URL` — your deployed API root, e.g. `https://your-app.vercel.app/api`.
- `AGENT_ID` — identifier for this PC, e.g. `office_1` (must match what the cloud API expects).
- `AGENT_SHARED_TOKEN` — Bearer token shared with the cloud API for `/api/agent/*` endpoints.
- `POLL_INTERVAL_MS` — optional, default `2000`.
- `LOCAL_AGENT_PORT` — optional, default `8099`.

## Run with PM2 (auto‑restart, background)

```bash
npm install -g pm2
cd local-agent
pm2 start ecosystem.config.cjs           # runs polling-agent.js
pm2 save
```

**After reboot (current user):** run once:

```powershell
cd local-agent\scripts
powershell -ExecutionPolicy Bypass -File .\install-windows-pm2-logon.ps1
```

This registers a **logon** scheduled task that runs `pm2 resurrect` so `zk-agent` comes back without opening a terminal.

Alternatively (Administrator): follow whatever `pm2 startup` prints, then `pm2 save`.

## Cloud / Vercel env (backend)

In the backend environment (Vercel project):

- `AGENT_SHARED_TOKEN=<same as agent .env>`
- `ALLOWED_AGENT_IDS=office_1,office_2` (comma‑separated list)

Application flow:

- `POST /api/probe-device` with body `{ "agent_id": "office_1", "device_ip": "192.168.0.201", "timeout_ms": 800 }` creates a job in the queue.
- The agent picks it up from `/api/agent/jobs`, runs the LAN probe, and posts the result back to `/api/agent/job-result`.
- The frontend can query `/api/job-status/:job_id` to show ✅/❌ to the user.

## Operations

```bash
pm2 status
pm2 logs zk-agent
pm2 restart zk-agent
```

Local health:

```http
GET http://127.0.0.1:8099/health
```
