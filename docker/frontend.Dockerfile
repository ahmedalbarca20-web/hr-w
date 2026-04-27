# ── Stage: base ───────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Stage: dev ────────────────────────────────────
FROM base AS dev
RUN npm install
COPY . .
CMD ["npm", "run", "dev", "--", "--host"]

# ── Stage: builder ────────────────────────────────
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

# ── Stage: prod (nginx) ───────────────────────────
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
COPY ../docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

