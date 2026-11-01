# ✓ Local-Only Setup Verification Checklist

## Modified Files

### 1. local-agent/polling-agent.js
- ✓ Added LOCAL_ONLY_MODE detection
- ✓ Made CLOUD_API_BASE_URL, AGENT_ID, AGENT_SHARED_TOKEN optional when not needed
- ✓ Modified polling loop to skip cloud polling when LOCAL_ONLY_MODE is true
- ✓ Agent runs as local relay server in local-only mode

### 2. backend/.env
- ✓ Commented out cloud-specific configs
- ✓ LOCAL_AGENT_URL set to http://127.0.0.1:8099
- ✓ Added documentation for local-only setup
- ✓ AGENT_SHARED_TOKEN and ALLOWED_AGENT_IDS can be empty

### 3. local-agent/.env
- ✓ CLOUD_API_BASE_URL set to empty (disables polling)
- ✓ LOCAL_AGENT_PORT remains 8099
- ✓ LOCAL_AGENT_TOKEN configured for relay auth
- ✓ AGENT_ID and AGENT_SHARED_TOKEN still present (unused in local mode)

### 4. ecosystem.config.js
- ✓ Added zk-agent entry for PM2 startup
- ✓ Configured to run polling-agent.js
- ✓ Set up logging to backend/logs/

### 5. Documentation & Scripts
- ✓ Created LOCAL-ONLY-SETUP.md with complete guide
- ✓ Created start-local-only.ps1 PowerShell script
- ✓ Created start-local-only.cmd batch script

## Configuration Verification

### Backend API (.env)
```
[✓] LOCAL_AGENT_URL=http://127.0.0.1:8099
[✓] CLOUD_API_BASE_URL commented/empty
[✓] Database configured (SQLite or MySQL)
```

### Local Agent (.env)
```
[✓] LOCAL_AGENT_PORT=8099
[✓] CLOUD_API_BASE_URL empty (no polling)
[✓] LOCAL_AGENT_TOKEN set
```

### PM2 Config
```
[✓] hr-backend service defined
[✓] hr-frontend service defined
[✓] zk-agent service defined
```

## System Flow (Local-Only)

```
┌──────────────────────────────────────────────────────┐
│ Frontend (http://localhost:3000)                     │
│ ├─ Displays device management UI                    │
│ └─ Sends API requests to backend                    │
└──────────────────┬───────────────────────────────────┘
                   │ (HTTP + JWT)
┌──────────────────▼───────────────────────────────────┐
│ Backend API (http://localhost:5000/api)              │
│ ├─ Authenticates requests (JWT)                     │
│ ├─ Manages database (SQLite/MySQL)                  │
│ └─ Relays device ops to local agent                 │
└──────────────────┬───────────────────────────────────┘
                   │ (HTTP + LOCAL_AGENT_TOKEN)
┌──────────────────▼───────────────────────────────────┐
│ Local Agent (http://127.0.0.1:8099)                  │
│ ├─ NO cloud polling                                 │
│ ├─ Acts as relay service only                       │
│ └─ Communicates with ZK devices                     │
└──────────────────┬───────────────────────────────────┘
                   │ (TCP + ZK Protocol)
┌──────────────────▼───────────────────────────────────┐
│ ZK Biometric Device (192.168.x.x)                    │
│ ├─ Accepts probe/pull commands                      │
│ └─ Returns attendance records                       │
└──────────────────────────────────────────────────────┘
```

## Startup Options

### Option 1: Using PM2 (Recommended)
```powershell
cd "<project root>"
pm2 start ecosystem.config.js
pm2 save
```

### Option 2: Using Start Script
```powershell
.\start-local-only.ps1
```

### Option 3: Manual Terminal (Dev/Debug)
```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev

# Terminal 3
cd local-agent
node polling-agent.js
```

## Health Checks

### Backend API
```bash
curl http://localhost:5000/api/health
# Expected: {"status":"ok","ts":"2024-01-13T..."}
```

### Local Agent
```bash
curl -X POST http://127.0.0.1:8099/execute \
  -H "Authorization: Bearer change_me_long_random_token" \
  -H "Content-Type: application/json" \
  -d '{"action":"probe","device_ip":"192.168.1.100","port":80}'
```

### Frontend
```
http://localhost:3000
# Expected: HR System login page
```

## First-Time Setup

### 1. Install Dependencies
```powershell
.\start-local-only.ps1
# (or manually: npm install in backend, frontend, local-agent)
```

### 2. Initialize Database
```powershell
cd backend
npm run seed:super-admin
```

### 3. Login
- URL: http://localhost:3000
- Email: (from seed output)
- Password: (from seed output)

### 4. Add ZK Device
- Navigate to: Settings → Devices → Add Device
- Enter device IP (e.g., 192.168.1.100)
- Click "Test Connection"
- Save device

### 5. Pull Attendance
- Select device
- Click "Pull Attendance"
- Data syncs from device to database

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `Cannot reach LOCAL_AGENT_URL` | Agent not running | Run `node local-agent/polling-agent.js` |
| `DB_DIALECT not set` | SQLite not configured | Add `DB_DIALECT=sqlite` to backend/.env |
| `Device connection failed` | Device IP unreachable | Verify device is on LAN, check firewall |
| `PM2: command not found` | PM2 not installed | `npm install -g pm2` |
| Port 5000/3000/8099 already in use | Port conflict | Change PORT or stop conflicting service |

## Files Changed Summary

| File | Purpose | Status |
|------|---------|--------|
| local-agent/polling-agent.js | Polling logic | ✓ Modified |
| backend/.env | Backend config | ✓ Modified |
| local-agent/.env | Agent config | ✓ Modified |
| ecosystem.config.js | PM2 startup | ✓ Modified |
| LOCAL-ONLY-SETUP.md | Guide doc | ✓ Created |
| start-local-only.ps1 | Start script | ✓ Created |
| start-local-only.cmd | Batch script | ✓ Created |

## ✓ Ready to Use!

All changes have been applied. The system is now configured for **local-only operation** without any cloud dependencies.

### Next Step
Run: `.\start-local-only.ps1` or `pm2 start ecosystem.config.js`

### Documentation
See: `LOCAL-ONLY-SETUP.md` for complete setup guide
