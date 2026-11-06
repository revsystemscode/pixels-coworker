# pixels-coworker

Plataforma web de reuniones en un mundo 2D (vista cenital, pixel art) con video y audio por proximidad.

Estado: **Fase 1 · Mundo multijugador** (sin video todavía). Ver [`docs/decisiones.md`](./docs/decisiones.md).

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

## Cómo probar

### Fase 1 · Mundo multijugador

1. `pnpm dev` y abre http://localhost:5173 en **dos navegadores** (o una ventana normal y otra privada).
2. En cada uno, escribe un nombre, elige avatar y pulsa **Entrar**.
3. Muévete con flechas o WASD, o haz clic en una casilla del mapa: cada navegador ve al otro caminar.
4. Escribe en el chat (Enter abre el chat, Escape vuelve al juego): el mensaje aparece en ambos.
5. En desarrollo, arriba al centro se ven los FPS.

Pruebas automáticas:

```bash
pnpm test                                   # unitarias e integración (Vitest)
pnpm --filter @pixels/web e2e               # E2E con Playwright (2 navegadores, chat, clic)
```

Prueba de carga (50 bots paseando por la oficina):

```bash
# El servidor admite 25 jugadores por sala; para la prueba, súbelo:
ROOM_MAX_CLIENTS=60 pnpm --filter @pixels/game-server dev
pnpm --filter @pixels/game-server bots -- 50      # Ctrl+C para parar
```

Abre la web y mira el contador de FPS (objetivo: 30 o más). Medido en un MacBook Pro 2019 con GPU
integrada (Intel UHD 630): 60 FPS estables con 50 bots.

### Fase 0 · Entorno

1. `pnpm dev`
2. En la pantalla de entrada, el panel **Servicios (desarrollo)** muestra los 5 servicios en verde.
3. `docker compose ps` muestra `postgres`, `redis` y `livekit` en marcha.

## Estructura

```
apps/
  web/            React 18 + Vite + Phaser 3 (src/game: escena, avatares, predicción)
    public/assets/  tilesets y personajes (Kenney, CC0)
    e2e/            pruebas E2E con Playwright
  game-server/    Colyseus: sala "world", autoridad del movimiento y el chat
    scripts/bots.ts bots para pruebas de carga
  api/            Fastify: salud de servicios; tokens de LiveKit en la Fase 2
packages/
  shared/         tipos, protocolo, mapa, colisiones y búsqueda de caminos (cliente y servidor)
    src/maps/       mapas en formato Tiled JSON
tools/            scripts para preparar assets y generar el mapa inicial
docker-compose.yml   Postgres, Redis y LiveKit para desarrollo local
```

## Mapas

Los mapas viven en `packages/shared/src/maps/` en formato **Tiled JSON**; los usan el cliente (para
dibujar) y el servidor (para validar colisiones). Se pueden abrir y editar con
[Tiled](https://www.mapeditor.org/). Reglas:

- Tiles de 16 px. Capas de tiles visibles: `floor`, `walls`, `decor-below`, `furniture`.
- Capa de tiles `collision` (oculta): cualquier tile pintado bloquea el paso.
- Capa de objetos `spawn` con un punto llamado `spawn`: donde aparecen los jugadores.

`office.json` se generó con `node tools/build-office-map.mjs`. Si lo editas en Tiled, no vuelvas a
ejecutar ese script (sobrescribiría tus cambios).

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
| `pnpm --filter @pixels/web e2e`                        | Pruebas E2E (Playwright)                                |
| `pnpm --filter @pixels/game-server bots -- 50`         | 50 bots para pruebas de carga                           |

Un hook de pre-commit (Husky + lint-staged) pasa ESLint y Prettier a los archivos modificados. La CI
(GitHub Actions) ejecuta lint, formato, tipos, pruebas, build y las pruebas E2E en cada push y pull
request.

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `chore:`…).
- Las claves de LiveKit solo viven en el servidor (API). Nunca en variables `VITE_*`.
- Cada asset gráfico o sonoro se registra en [`ASSETS_LICENSES.md`](./ASSETS_LICENSES.md) antes de añadirlo.

## Notas de versiones

- TypeScript está fijado en `~6.0` porque `typescript-eslint` todavía no soporta TypeScript 7.
- Phaser se mantiene en la rama 3.x (la que pide el plan), aunque ya existe Phaser 4.
