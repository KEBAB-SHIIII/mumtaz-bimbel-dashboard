# syntax=docker/dockerfile:1
# Image satu service: API Express + SPA frontend dari origin yang sama, memakai backend/.env yang SAMA.
# Path relatif di .env (FRONTEND_DIST_DIR=../frontend/dist, ./secrets/...) dihitung dari /app/backend.
# Build:  docker build -t mumtaz-bimbel .
# Run:    docker run --env-file backend/.env -p 3001:3001 \
#           -v "$PWD/backend/secrets:/app/backend/secrets:ro" mumtaz-bimbel
# Di server publik ubah FRONTEND_ORIGIN ke https://domain-anda dan TRUST_PROXY=1.

ARG NODE_VERSION=22

# --- 1. Build semua workspace (contracts → backend → frontend) ----------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY backend backend
COPY frontend frontend
RUN npm run build

# --- 2. Dependency production backend saja (tanpa devDependency & paket frontend) -----
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY backend/package.json backend/
# `npm ci -w backend --omit=dev` tetap memasang devDependency (perilaku npm workspaces), jadi
# workspace frontend dibuang dari manifest lalu dependency di-resolve dari lockfile yang sama.
RUN node -e "const f='package.json',p=require('./'+f);p.workspaces=p.workspaces.filter(w=>w!=='frontend');delete p.devDependencies;require('fs').writeFileSync(f,JSON.stringify(p))" \
 && npm install --omit=dev --no-audit --no-fund --ignore-scripts=false \
 && npm cache clean --force

# --- 3. Runtime ------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    FRONTEND_DIST_DIR=../frontend/dist
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/drizzle backend/drizzle
COPY --from=build /app/frontend/dist frontend/dist
WORKDIR /app/backend
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Migration sebelum rilis: docker run --rm --env-file backend/.env mumtaz-bimbel node dist/scripts/migrate.js
CMD ["node", "dist/server.js"]
