# HR System – نظام الموارد البشرية المبسط

Bilingual (Arabic / English) HR system built with **Node.js + Express + React + MariaDB + JWT**.

## Stack
| Layer | Technology |
|-------|------------|
| Backend | Node.js 20, Express 5, Sequelize |
| Database | MariaDB 11 |
| Auth | JWT (Access + Refresh tokens) |
| Frontend | React 18, Vite, React Router v6 |
| i18n | i18next (AR ⇄ EN, RTL support) |
| State | Redux Toolkit |
| Container | Docker + Docker Compose |
| Proxy | Nginx (production) |

## Quick Start (Development)
```bash
# 1. Copy env files
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env

# 2. Start all services
docker compose up --build

# Backend  → http://localhost:5000
# Frontend → http://localhost:5173
```

## Production Build
```bash
docker compose -f docker-compose.prod.yml up --build -d
# Nginx serves SPA on :80 and proxies /api → backend:5000
```

## Database seeding (optional)

```bash
cd backend
npm run seed                      # first company + admin (see SEED_EMAIL / SEED_PASSWORD in .env)
node database/seed.super-admin.js # platform super-admin (see script header for env vars)
```

> **Login:** `POST /api/auth/login` with `{ email, password }` and optional `company_code` (matches company `tax_id`).

# hr-w
