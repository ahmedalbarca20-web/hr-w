# HR Local Agent (LAN Bridge)

Local Node.js bridge for biometric devices in private LAN (`192.168.x.x`), designed for Vercel backend integration through Cloudflare Tunnel.

## Features

- Authenticated bridge with Bearer token
- Supports `POST /execute` (`action=probe`) and `POST /probe-connection`
- LAN device timeout (200-1000ms), with one retry on timeout
- Arabic decoding helper (`utf8`, `latin1`, `windows-1256`) for mojibake cases
- Structured JSON logs + health endpoint

## Run locally

```bash
cd local-agent
npm install
cp .env.example .env
npm start
```

## PM2 (always on)

```bash
npm install -g pm2
cd local-agent
pm2 start ecosystem.config.cjs
pm2 startup
pm2 save
```

## Cloudflare Tunnel (stable URL)

Install `cloudflared`, then run:

```bash
cloudflared tunnel login
cloudflared tunnel create zk-agent
cloudflared tunnel route dns zk-agent agent.yourdomain.com
cloudflared tunnel run zk-agent --url http://localhost:8099
```

Set on Vercel backend:

- `LOCAL_AGENT_URL=https://agent.yourdomain.com`
- `LOCAL_AGENT_TOKEN=<same value in local-agent/.env>`

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

Response:

```json
{
  "ok": true,
  "serial_number": "AE1L....",
  "status": 200,
  "source": "local_agent",
  "duration_ms": 211
}
```

## Health check

```http
GET /health
```

Returns:

```json
{ "ok": true, "service": "hr-w-local-agent" }
```
