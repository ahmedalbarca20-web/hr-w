# hr-w
## HR System – نظام الموارد البشرية المبسط

Bilingual (Arabic / English) HR system built with **Node.js + Express + React + MariaDB + JWT**.

## Stack
<table>
  <thead>
    <tr>
      <th>Layer</th>
      <th>Technology</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Backend</td><td>Node.js 20, Express 5, Sequelize</td></tr>
    <tr><td>Database</td><td>MariaDB 11</td></tr>
    <tr><td>Auth</td><td>JWT (Access + Refresh tokens)</td></tr>
    <tr><td>Frontend</td><td>React 18, Vite, React Router v6</td></tr>
    <tr><td>i18n</td><td>i18next (AR ⇄ EN, RTL support)</td></tr>
    <tr><td>State</td><td>Redux Toolkit</td></tr>
    <tr><td>Container</td><td>Docker + Docker Compose</td></tr>
    <tr><td>Proxy</td><td>Nginx (production)</td></tr>
  </tbody>
</table>

## Quick Start (Development)
```bash
# 1. Copy env files
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env

# 2. Start all services
docker compose up --build

# Backend  → http://localhost:5000
# Frontend → http://localhost:3000
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
