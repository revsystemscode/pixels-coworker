# syntax=docker/dockerfile:1.7
# Imágenes de producción. Una por servicio (docker build --target <nombre>):
#   api, game-server, migrate (aplica las migraciones) y web (Caddy con la web compilada).
# Las de la API y el juego llevan node_modules de producción (~750 MB): se construyen en el servidor.
# Ver deploy/docker-compose.prod.yml.

FROM node:24.22.2-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# --- Compilación (todo el monorepo) ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# La web usa direcciones relativas: la misma compilación vale para cualquier dominio.
ENV VITE_API_URL=/api VITE_GAME_SERVER_URL=/game VITE_AUTH_URL=
RUN pnpm turbo run build --filter=@pixels/api --filter=@pixels/game-server --filter=@pixels/web

FROM node:24.22.2-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
USER node

# --- Dependencias de producción de cada servicio (sin las de desarrollo ni scripts) ---
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/game-server/package.json apps/game-server/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

FROM manifests AS api-deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@pixels/api..."

FROM manifests AS game-deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@pixels/game-server..."

# --- API ---
FROM runtime AS api
COPY --from=api-deps --chown=node /repo /repo
COPY --from=build --chown=node /repo/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]

# --- Servidor de juego ---
FROM runtime AS game-server
COPY --from=game-deps --chown=node /repo /repo
COPY --from=build --chown=node /repo/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node /repo/apps/game-server/dist apps/game-server/dist
WORKDIR /repo/apps/game-server
EXPOSE 2567
CMD ["node", "dist/index.js"]

# --- Migraciones (prisma migrate deploy): solo la CLI de Prisma y las migraciones ---
FROM node:24.22.2-alpine AS migrate
WORKDIR /db
RUN echo '{"type":"module","private":true}' > package.json \
  && npm install --no-audit --no-fund --save-exact prisma@7.10.1
COPY packages/db/prisma ./prisma
COPY packages/db/prisma.config.ts ./
CMD ["npx", "prisma", "migrate", "deploy"]

# --- Web: Caddy (con caddy-l4 para el TURN de LiveKit en el 443) y la web compilada ---
FROM caddy:2.11.4-builder AS caddy-build
RUN xcaddy build v2.11.4 --with github.com/mholt/caddy-l4@v0.1.2

FROM caddy:2.11.4 AS web
COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/web
