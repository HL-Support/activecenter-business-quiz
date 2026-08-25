# Portables Image fuer den Coolify-Umzug (Audit 2026-08-23, §7 P0-5, Phase 3).
#
# Aus DIESEM Image entstehen spaeter beide Coolify-Applications (§6):
#   - business-leads-web     -> Standard-CMD unten (HTTP + statische Auslieferung)
#   - business-leads-worker  -> dasselbe Image, abweichendes Startkommando, genau eine Replika
#
# Der Vercel-Betrieb bleibt davon unberuehrt: Vercel baut weiter ueber vercel.json/build.js
# und ignoriert dieses Dockerfile.
#
# Versionspinnung (Audit 13.3.7/13.5.6): Node 24 ist dreifach festgelegt - engines.node in
# package.json, die CI (activecenter-safety.yml) und dieses Basisimage. pnpm kommt ueber
# Corepack aus dem Feld "packageManager", damit Build und Entwicklung dieselbe pnpm-Version
# benutzen.
#
# OFFEN vor dem ersten Produktions-Deploy: das Basisimage zusaetzlich auf einen Digest pinnen
# (FROM node:24-slim@sha256:...). Der Digest wird beim ersten echten Build ermittelt und hier
# eingetragen; ohne laufendes Docker laesst er sich nicht ehrlich vorwegnehmen.

# ---------------------------------------------------------------------------------------
# Stage 1: Produktionsabhaengigkeiten (nur "dependencies", kein devDependencies-Ballast)
# ---------------------------------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
ENV CI=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------------------
# Stage 2: Build (braucht devDependencies: esbuild)
# ---------------------------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
ENV CI=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Erzeugt dist/ exakt so wie der Vercel-Build (buildCommand in vercel.json ist derselbe).
RUN pnpm run build

# ---------------------------------------------------------------------------------------
# Stage 3: Runtime
# ---------------------------------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# curl ausschliesslich fuer den Docker-HEALTHCHECK; kein Build-Werkzeug im Laufzeitimage.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Nur was die Laufzeit wirklich braucht: Produktionsmodule, die API-Handler, der Adapter
# und die gebauten Assets. Kein src/, kein build.js, keine Tests, keine Migrations-SQL.
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node api ./api
COPY --chown=node:node server ./server

# Non-root (Audit 13.5.6). Das Image node:24-slim bringt den Benutzer "node" (uid 1000) mit.
USER node

EXPOSE 3000

# /health/live ist bewusst der Container-Healthcheck: nur Prozesszustand, keine externen
# Aufrufe. Der Bereitschaftscheck /health/ready (Env + kurzer Datenquellen-Ping) gehoert an
# den Coolify-Healthcheck bzw. an Traefik; der detaillierte /api/lead-system-health bleibt
# geschuetzte Diagnose und wird NIE eng getaktet abgefragt (Audit §6 "Healthchecks").
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health/live" || exit 1

# Exec-Form: node laeuft als PID 1 und bekommt SIGTERM direkt; server/app-server.js faehrt
# den Server daraufhin geordnet herunter (Drain bis 10s, Exit 0).
CMD ["node", "server/app-server.js"]
