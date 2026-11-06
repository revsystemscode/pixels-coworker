# pixels-coworker

Plataforma web de reuniones en un mundo 2D (vista cenital, pixel art) con video y audio por proximidad.

Estado: **Fase 0 · Definición** (entorno de desarrollo).

## Requisitos

- Node.js 24 o superior
- pnpm 11 (`corepack enable` o `npm i -g pnpm`)
- Docker con `docker compose` (en macOS se recomienda [OrbStack](https://orbstack.dev): `brew install orbstack`)

## Arranque rápido

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` levanta Postgres, Redis y LiveKit con Docker (y espera a que estén sanos) y después arranca
en paralelo:

| App                | URL                                                | Qué es                                       |
| ------------------ | -------------------------------------------------- | -------------------------------------------- |
| `apps/web`         | http://localhost:5173                              | React + Vite + Phaser                        |
| `apps/api`         | http://localhost:3001/health                       | API Fastify                                  |
| `apps/game-server` | ws://localhost:2567 · http://localhost:2567/health | Servidor Colyseus                            |
| LiveKit            | ws://localhost:7880                                | SFU de video (modo dev: `devkey` / `secret`) |
| PostgreSQL         | localhost:5432                                     | usuario, clave y base: `pixels`              |
| Redis              | localhost:6379                                     |                                              |

Sin Docker puedes arrancar solo las apps con `pnpm dev:apps` (los servicios aparecerán como `down`).

## Cómo probar la Fase 0

1. `pnpm dev`
2. Abre http://localhost:5173: el panel **Servicios** debe mostrar los 5 servicios en verde (`up`) y
   debajo una cuadrícula dibujada por Phaser.
3. `docker compose ps` debe mostrar `postgres`, `redis` y `livekit` en marcha.
4. `pnpm test` ejecuta las pruebas unitarias de todos los paquetes.

## Estructura

```
apps/
  web/            React 18 + Vite + Phaser 3
  game-server/    Colyseus: sala "world" (autoridad del juego)
  api/            Fastify: salud de servicios; tokens de LiveKit en la Fase 2
packages/
  shared/         tipos, constantes y utilidades compartidas
docker-compose.yml   Postgres, Redis y LiveKit para desarrollo local
```

`@pixels/shared` se consume desde el código fuente en desarrollo (condición de exportación `source`), así
que no hace falta compilarlo para `pnpm dev`, `pnpm test` ni `pnpm typecheck`. `pnpm build` lo compila a
`dist/` para producción.

## Scripts

| Script                                                 | Qué hace                                                |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `pnpm dev`                                             | Servicios de Docker + todas las apps en modo desarrollo |
| `pnpm dev:apps`                                        | Solo las apps (sin Docker)                              |
| `pnpm services:up` / `services:down` / `services:logs` | Gestiona los contenedores                               |
| `pnpm lint` / `pnpm format`                            | ESLint / Prettier                                       |
| `pnpm typecheck` / `pnpm test` / `pnpm build`          | Tipos, pruebas (Vitest) y build, vía Turborepo          |

Un hook de pre-commit (Husky + lint-staged) pasa ESLint y Prettier a los archivos modificados. La CI
(GitHub Actions) ejecuta lint, formato, tipos, pruebas y build en cada push y pull request.

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `chore:`…).
- Las claves de LiveKit solo viven en el servidor (API). Nunca en variables `VITE_*`.
- Cada asset gráfico o sonoro se registra en [`ASSETS_LICENSES.md`](./ASSETS_LICENSES.md) antes de añadirlo.

## Notas de versiones

- TypeScript está fijado en `~6.0` porque `typescript-eslint` todavía no soporta TypeScript 7.
- Phaser se mantiene en la rama 3.x (la que pide el plan), aunque ya existe Phaser 4.
