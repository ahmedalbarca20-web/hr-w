# Local-Only Setup Guide (بدون سحابة — كل شيء محلي)

## Overview
This configuration runs the entire HR system locally without any cloud dependencies:
- **Backend API**: http://localhost:5000
- **Frontend UI**: http://localhost:3000
- **ZK Device Agent**: http://localhost:8099

## What Changed

### 1. Disabled Cloud Polling
- **Agent Mode**: Changed from cloud polling to **local relay only**
- **Cloud API**: No longer required or polled
- **Agent Shared Token**: Only used for local agent authentication (optional)

### 2. Local-Agent Behavior
The `local-agent` now runs in **local-only mode**:
- Does NOT poll the cloud API
- Acts as a local relay service for ZK device operations
- Runs continuously but doesn't fetch jobs from a remote server

### 3. Device Operations Flow
```
Frontend (http://localhost:3000)
    ↓
Backend API (http://localhost:5000)
    ↓
Local Agent Relay (http://localhost:8099)
    ↓
ZK Device (192.168.x.x)
```

## Configuration Files

### Backend (backend/.env)
```env
NODE_ENV=development
PORT=5000

# ← Leave AGENT_SHARED_TOKEN and ALLOWED_AGENT_IDS commented/empty
# for local-only mode (no cloud polling needed)

# Local agent relay
LOCAL_AGENT_URL=http://127.0.0.1:8099
LOCAL_AGENT_TOKEN=change_me_long_random_token

# Database, email, etc. (configured as before)
```

### Local Agent (local-agent/.env)
```env
LOCAL_AGENT_PORT=8099
LOCAL_AGENT_TOKEN=change_me_long_random_token

# Leave CLOUD_API_BASE_URL empty for local-only mode
CLOUD_API_BASE_URL=
```

## Startup (Using PM2)

### Option 1: Start All Services (Recommended)
```powershell
cd "<project root>"
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

This starts:
1. **hr-backend** (port 5000)
2. **hr-frontend** (port 3000)
3. **zk-agent** (port 8099) — runs in local-only mode

### Option 2: Start Manually (for debugging)
```powershell
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Local Agent
cd local-agent
node polling-agent.js

# Terminal 4: Local Agent (Alternative - server only, no polling)
cd local-agent
node server.js
```

## Endpoints

### Device Operations (Via Backend)
All device operations use HTTP relay to the local agent:

```bash
# Queue a device probe
POST http://localhost:5000/api/device-agent/jobs
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
{
  "agent_id": "office_1",
  "action": "probe",
  "device_ip": "192.168.1.100",
  "port": 80
}

# Pull attendance data
POST http://localhost:5000/api/device-agent/jobs
{
  "agent_id": "office_1",
  "action": "pull_attendance",
  "device_id": 1,
  "device_ip": "192.168.1.100"
}
```

### Local Agent Relay (Direct)
```bash
# Direct ZK probe via local agent
POST http://127.0.0.1:8099/execute
Authorization: Bearer <LOCAL_AGENT_TOKEN>
{
  "action": "probe",
  "device_ip": "192.168.1.100",
  "port": 80
}
```

## Ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 5000 | http://localhost:5000/api |
| Frontend UI | 3000 | http://localhost:3000 |
| Local Agent | 8099 | http://127.0.0.1:8099 |

## Database

Default: SQLite (database/hr_dev.sqlite)

```env
# In backend/.env:
DB_DIALECT=sqlite
```

Or switch to MySQL/PostgreSQL:
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=hr_db
DB_USER=hr_user
DB_PASS=change_me_db_password
```

## Troubleshooting

### Agent Not Connecting to Devices
1. Verify LOCAL_AGENT_URL is correct: `http://127.0.0.1:8099`
2. Check device IP is reachable from your machine
3. Verify ZK device communication port (default: 4370 for TCP)

### Backend Can't Reach Agent
```
Error: Cannot reach LOCAL_AGENT_URL from this server
```
Solution:
1. Ensure agent is running: `node local-agent/polling-agent.js`
2. Check LOCAL_AGENT_URL in backend/.env points to correct address
3. Check LOCAL_AGENT_TOKEN matches in both configs

### Backend Can't Find Database
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```
Solution:
1. If using SQLite: ensure `DB_DIALECT=sqlite` in backend/.env
2. If using MySQL: ensure MySQL is running on localhost:3306
3. Check database credentials in backend/.env

## Next Steps

1. **Initialize Database**:
   ```powershell
   cd backend
   npm run seed:super-admin
   ```

2. **Login**:
   - URL: http://localhost:3000
   - Email: (from seeding step)
   - Password: (set during seeding)

3. **Add ZK Device**:
   - Navigate to: Devices → Add Device
   - Enter device IP (e.g., 192.168.1.100)
   - Test connection via "Probe" button

4. **Pull Attendance**:
   - Select device
   - Click "Pull Attendance"
   - Data will be synced from device to database

## Environment Variables Reference

### Critical for Local-Only Setup
- `LOCAL_AGENT_URL=http://127.0.0.1:8099` (must be set)
- `CLOUD_API_BASE_URL=` (must be empty/omitted for local mode)

### Optional (Cloud/Polling)
- `AGENT_SHARED_TOKEN` (only needed if polling cloud)
- `ALLOWED_AGENT_IDS` (only needed if polling cloud)

### Database
- `DB_DIALECT=sqlite` (recommended for dev)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` (for MySQL/Postgres)

## Performance Notes

- **Local Setup**: ~100ms device response time (LAN)
- **SQLite**: Fast for single company, good for development
- **MySQL/PostgreSQL**: Better for multiple companies/large datasets

## Support & Logs

### Backend Logs
```
backend/logs/pm2-backend-out.log
backend/logs/pm2-backend-error.log
```

### Agent Logs
```
backend/logs/pm2-agent-out.log
backend/logs/pm2-agent-error.log
```

### Frontend Logs
```
backend/logs/pm2-frontend-out.log
backend/logs/pm2-frontend-error.log
```

## Reverting to Cloud Mode

To enable cloud polling again:

1. **backend/.env**:
```env
AGENT_SHARED_TOKEN=your_cloud_token
ALLOWED_AGENT_IDS=office_1
```

2. **local-agent/.env**:
```env
CLOUD_API_BASE_URL=https://your-cloud-api.com
AGENT_ID=office_1
AGENT_SHARED_TOKEN=your_cloud_token
```

3. Restart services:
```powershell
pm2 restart all
```

---

**Created**: 2024-01-13
**Mode**: Local-Only (بدون سحابة)
**Cloud**: Disabled
