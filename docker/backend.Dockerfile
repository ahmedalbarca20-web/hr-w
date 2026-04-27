# ── Stage: base ───────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Stage: dev ────────────────────────────────────
FROM base AS dev
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# ── Stage: prod ───────────────────────────────────
FROM base AS prod
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]

