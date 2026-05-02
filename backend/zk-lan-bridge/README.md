# zk-lan-bridge

Small **LAN-only** service: polls one ZKTeco device using **zkteco-js** (same code path as the HR API via `zktecoSocket.service.js`) and exposes:

- `GET /api/v1/bio-sync` — JSON snapshot compatible with `DTR_ZKTECO_API_URL` / `dtrZktecoBridge.service.js`
- `GET /health` — bridge status

## Setup

1. Copy env and set the device IP:

   ```bash
   cp zk-lan-bridge/.env.example zk-lan-bridge/.env
   ```

2. Run on a PC **on the same LAN as the biometric device**:

   ```bash
   cd backend
   npm run bridge:zk-lan
   ```

3. Point the HR API at this bridge (same machine or LAN IP):

   ```env
   DTR_ZKTECO_API_URL=http://192.168.1.10:8090
   ```

   If the HR API is on the internet (e.g. Vercel), expose the bridge with **ngrok** or **Cloudflare Tunnel** and set `DTR_ZKTECO_API_URL` to that HTTPS URL.

## Behaviour

- Polls the device every `ZK_BRIDGE_POLL_MS` (default 45s).
- Until the first successful poll, `GET /api/v1/bio-sync` returns **204 No Content** (same idea as an empty DTR snapshot).
- Optional auth: set `ZK_BRIDGE_TOKEN` and send `X-Bridge-Token` or `X-Api-Key` on bio-sync requests.

## One device per process

This bridge is **one device per process**. For multiple devices on the same LAN, run multiple instances with different `.env` files / ports, or use separate processes per `ZK_BRIDGE_DEVICE_IP`.
