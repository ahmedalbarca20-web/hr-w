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

```bash
cd local-agent
npm install
copy .env.example .env
```

Edit `.env`:

- `LOCAL_AGENT_TOKEN` — long random secret (must match Vercel / backend `LOCAL_AGENT_TOKEN` or `AGENT_TOKEN`).

### 2) PM2 (auto-restart, no terminal)

```bash
npm install -g pm2
cd local-agent
pm2 start ecosystem.config.cjs
pm2 save
```

**After reboot (current user):** run once:

```powershell
cd local-agent\scripts
powershell -ExecutionPolicy Bypass -File .\install-windows-pm2-logon.ps1
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
```
