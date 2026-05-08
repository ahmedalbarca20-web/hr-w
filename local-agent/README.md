<<<<<<< HEAD
# HR Local Agent (LAN bridge)

Node.js process on a **PC inside the same LAN as the ZKTeco device** (`192.168.x.x`). The cloud API (e.g. Vercel) cannot open TCP/HTTP to private IPs, so this agent runs next to the device and is reached over **HTTPS via Cloudflare Tunnel**.

## Architecture

```text
Browser / Vercel API  →  https://agent.yourdomain.com  →  cloudflared (Windows service)
  →  http://127.0.0.1:8099  →  this agent  →  device (LAN)
```

## Security

- All protected routes require `Authorization: Bearer <LOCAL_AGENT_TOKEN>`.
- **Public hostname in Cloudflare must point to `http://127.0.0.1:8099` (or `http://localhost:8099`)**, not `https://localhost` — the agent speaks HTTP on the loopback side.
- If a tunnel token was ever committed to git, **rotate the token** in Cloudflare Zero Trust and update the Windows service.

## Behaviour

- `GET /health` — no auth (for uptime checks).
- `POST /probe-connection`, `POST /execute` — require Bearer token.
- HTTP probe to the device: default **800 ms** per attempt, **one retry** on timeout only, hard cap **1000 ms** (`runProbe` in `server.js`).
- Arabic / mojibake: `utf8`, `latin1`, `windows-1256` decoding helpers on probe responses.
- ZK TCP actions (`list_users`, `pull_attendance`) use longer socket timeouts as in `zktecoSocket.service`.

## One-time setup (Windows)

### Phase 1: one-command bootstrap

**For production (recommended):** Use Tailscale VPN for secure, firewall-friendly connectivity:

```powershell
cd local-agent
powershell -ExecutionPolicy Bypass -File .\scripts\install-hr-agent-complete.ps1
```

This installer will:
- Install Tailscale VPN (mesh network, no public IP exposure)
- Install Node.js if missing
- Install local-agent dependencies
- Start agent as Windows service
- Register auto-start on reboot

**After installation:**

1. Start Tailscale and connect your account:
```powershell
tailscale up
```
Follow the browser link to authenticate.

2. Get your Tailscale IP:
```powershell
tailscale ip -4
```
Output example: `100.64.1.50`

3. Share this IP with admin to update Vercel:
```
LOCAL_AGENT_URL=http://100.64.1.50:8099
```

4. Test locally:
```powershell
curl http://127.0.0.1:8099/health
```

---

### Phase 1 (legacy): one-command bootstrap

Run this once on the LAN PC that is next to the device:

```powershell
cd local-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-agent.ps1
```

This will:

- create `.env` from `.env.example` if needed
- install `pm2` if missing
- install local dependencies
- start `zk-agent`
- register the Windows logon task for auto-restart

After that, the operator only uses the app UI. The network details stay hidden.

### Phase 2: next improvement

After phase 1 is stable, add LAN device auto-discovery so the user can pick a device from a list instead of typing IPs.

### 1) Agent env
=======
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
>>>>>>> 95eb295f5def2c5c3da5abbaff9693d85cdff619

```bash
cd local-agent
npm install
copy .env.example .env
```

<<<<<<< HEAD
Edit `.env`:

- `LOCAL_AGENT_TOKEN` — long random secret (must match Vercel / backend `LOCAL_AGENT_TOKEN` or `AGENT_TOKEN`).

### 2) PM2 (auto-restart, no terminal)
=======
Then edit `.env`:

- `LOCAL_AGENT_TOKEN` — long random secret for local HTTP routes (used only if you call `POST /execute` directly).
- `CLOUD_API_BASE_URL` — your deployed API root, e.g. `https://your-app.vercel.app/api`.
- `AGENT_ID` — identifier for this PC, e.g. `office_1` (must match what the cloud API expects).
- `AGENT_SHARED_TOKEN` — Bearer token shared with the cloud API for `/api/agent/*` endpoints.
- `POLL_INTERVAL_MS` — optional, default `2000`.
- `LOCAL_AGENT_PORT` — optional, default `8099`.

## Run with PM2 (auto‑restart, background)
>>>>>>> 95eb295f5def2c5c3da5abbaff9693d85cdff619

```bash
npm install -g pm2
cd local-agent
<<<<<<< HEAD
pm2 start ecosystem.config.cjs
=======
pm2 start ecosystem.config.cjs           # runs polling-agent.js
>>>>>>> 95eb295f5def2c5c3da5abbaff9693d85cdff619
pm2 save
```

**After reboot (current user):** run once:

```powershell
cd local-agent\scripts
powershell -ExecutionPolicy Bypass -File .\install-windows-pm2-logon.ps1
<<<<<<< HEAD
```

This registers a **logon** scheduled task that runs `pm2 resurrect` so `zk-agent` comes back without opening a terminal.

Alternative (Administrator): follow whatever `pm2 startup` prints, then `pm2 save`.

### 3) Cloudflare Tunnel as a Windows service

1. In **Zero Trust → Networks → Tunnels**, create or open the tunnel and copy the **connector install token**.
2. **Administrator** CMD:

```bat
cd local-agent\scripts
install-cloudflared-windows-service.cmd YOUR_TUNNEL_TOKEN
```

Or install manually per [Cloudflare: Run as a service on Windows](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/as-a-service/windows/).

3. In the tunnel **Public Hostname**, set:

- **Service**: `http://127.0.0.1:8099` (HTTP, not HTTPS).

4. Verify from another network:

```http
GET https://agent.yourdomain.com/health
```

### 4) Cloud / Vercel env

On the backend:

- `LOCAL_AGENT_URL=https://agent.yourdomain.com` (no trailing slash)
- `LOCAL_AGENT_TOKEN=<same as agent .env>` (or set `AGENT_TOKEN` to the same value)

Optional gateway used by the SPA (JWT, feature `devices`):

- `POST /api/probe-device` with body `{ "device_ip": "192.168.0.201", "timeout_ms": 800 }` — forwards to `LOCAL_AGENT_URL/execute` with `action: "probe"`.

## Manual cloudflared (not recommended if service is installed)

Set **user or system** env var `CLOUDFLARED_TUNNEL_TOKEN`, then:

```bat
start-cloudflared.cmd
```

Do **not** paste tokens into tracked files.

## Request example (`/execute`)

```http
POST /execute
Authorization: Bearer <LOCAL_AGENT_TOKEN>
Content-Type: application/json

{
  "action": "probe",
  "device_ip": "192.168.0.201",
  "port": 80,
  "timeout_ms": 800
}
```

## Operations

```bash
pm2 status
pm2 logs zk-agent
pm2 restart zk-agent
```

Check tunnel service:

```bat
sc query cloudflared
=======
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
>>>>>>> 95eb295f5def2c5c3da5abbaff9693d85cdff619
```
