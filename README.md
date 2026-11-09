# pixels-coworker

Plataforma web de reuniones en un mundo 2D (vista cenital, pixel art) con video y audio por proximidad.

Estado: **MVP completo** (fases 0–3 y pizarra). Ver [`docs/decisiones.md`](./docs/decisiones.md).

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

`pnpm dev` levanta Postgres, Redis, Mailpit y LiveKit con Docker (y espera a que estén sanos), aplica
las migraciones de la base de datos y después arranca en paralelo:

| App                | URL                                                | Qué es                                       |
| ------------------ | -------------------------------------------------- | -------------------------------------------- |
| `apps/web`         | http://localhost:5173                              | React + Vite + Phaser                        |
| `apps/api`         | http://localhost:3001/health                       | API Fastify (login, espacios, LiveKit)       |
| `apps/game-server` | ws://localhost:2567 · http://localhost:2567/health | Servidor Colyseus                            |
| LiveKit            | ws://localhost:7880                                | SFU de video (modo dev: `devkey` / `secret`) |
| PostgreSQL         | localhost:5432                                     | usuario, clave y base: `pixels`              |
| Redis              | localhost:6379                                     | Avisos de la API al servidor de juego        |
| Mailpit            | http://localhost:8025                              | Buzón local: aquí llegan los correos         |

Sin Docker puedes arrancar solo las apps con `pnpm dev:apps` (los servicios aparecerán como `down`).

## Cómo probar

### Fase 4 · Reacciones y mano levantada

1. `pnpm dev`. Entra con dos cuentas al mismo espacio.
2. Pulsa el botón de la cara (abajo, a la derecha de los controles de video) y elige una reacción, o
   usa las teclas **1–6** (👋 👍 ❤️ 😂 🎉 😮). Se ve 3 segundos sobre tu avatar y, si alguien está
   cerca, también en tu burbuja de video.
3. **✋** (o la tecla **H**) levanta la mano: queda junto a tu nombre y en tu burbuja hasta que la
   bajes. Quien entra después también la ve.

```bash
pnpm --filter @pixels/web e2e reactions
```

### Pizarra colaborativa

1. `pnpm dev`. Entra con dos cuentas al mismo espacio (ver Fase 3).
2. Camina hasta una pizarra: hay una en la pared de la oficina abierta y otra en la sala de reuniones.
   Cuando estás a 2 casillas o menos se resalta en amarillo y aparece **Abrir «Pizarra…»**. Se abre con
   ese botón, con la tecla **E** o haciendo clic en la pizarra (si está lejos, el avatar camina hasta
   ella).
3. Dibuja con las dos cuentas: lo de cada una le aparece a la otra al momento, con su puntero y su
   nombre. Arriba se ve quién tiene la pizarra abierta y se puede silenciar el micrófono.
4. **Cerrar pizarra**, sal del espacio y vuelve: lo dibujado sigue ahí.

Todos los miembros dibujan, también los invitados. No se pueden pegar imágenes (necesitan un almacén
de archivos; llegará más adelante). Límites por pizarra: 3000 elementos y 2 MB.

```bash
pnpm --filter @pixels/web e2e whiteboard
```

### Fase 3 · Cuentas y espacios

1. `pnpm dev` y abre http://localhost:5173. Escribe un correo cualquiera (no hace falta que exista) y
   pulsa **Enviarme un enlace**.
2. Abre http://localhost:8025 (Mailpit): ahí está el correo. Pulsa **Entrar** y vuelves a la web con
   la sesión iniciada. La primera vez eliges nombre y avatar.
3. En **Mis espacios**, crea un espacio. Pulsa **Entrar** y, dentro, el botón **Espacio** abre los
   ajustes: **Crear enlace** genera un enlace de invitación (como miembro o invitado, de 1 a 30 días).
4. Abre el enlace en otro navegador (o una ventana privada), inicia sesión con otro correo y pulsa
   **Unirme al espacio**. Los dos estáis en el mismo mapa.
5. En **Espacio** se ven los miembros. El dueño puede nombrar admins, cambiar roles, expulsar (la
   persona sale del mapa al momento), renombrar y borrar el espacio. Quien no es dueño puede salir.
6. Muévete, pulsa **Salir** y vuelve a entrar: apareces donde lo dejaste.

| Rol      | Qué puede hacer                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Dueño    | Todo, incluido borrar el espacio y nombrar admins                                |
| Admin    | Invitar, cambiar el rol de miembros e invitados, expulsar y renombrar el espacio |
| Miembro  | Entrar cuando quiera y ver la lista de miembros                                  |
| Invitado | Entrar, pero no ve la lista de miembros ni invita                                |

Prueba automática del criterio de aceptación (una persona crea un espacio, comparte el enlace y otra
entra con su cuenta):

```bash
pnpm --filter @pixels/web e2e accounts
```

#### Login con Google (opcional)

Sin configurarlo, el botón de Google no aparece y el login por correo funciona igual. Para activarlo:

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y configura la
   **pantalla de consentimiento de OAuth** (tipo «Externo», con el nombre de la app y tu correo).
2. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, elige
   «Aplicación web» y añade:
   - Origen autorizado de JavaScript: `http://localhost:5173`
   - URI de redirección autorizado: `http://localhost:3001/api/auth/callback/google`
3. Copia el ID y el secreto en `.env` (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`) y reinicia
   `pnpm dev`. En producción se añaden también el dominio real y su URI de redirección.

### Fase 2 · Video por proximidad

Necesita LiveKit en marcha (`pnpm dev` lo levanta con Docker). Usa tres navegadores (por ejemplo,
Chrome normal, Chrome en modo incógnito y Firefox) y, si es posible, auriculares para evitar eco.

1. `pnpm dev`. Con A, crea un espacio e invita a B y C con un enlace (ver Fase 3).
2. Al abrir el espacio, antes de entrar, verás la vista previa de tu cámara y una barra con el nivel del micrófono.
   Puedes apagar la cámara o el micrófono y elegir dispositivo. Si no das permiso, puedes entrar igual.
3. Entra con A y B: al aparecer juntos se ven en burbujas de video sobre los avatares y se oyen.
4. Con C, aléjate más de 3 casillas antes de que entren los demás: C no ve ni oye a A y B. Acércate a
   menos de 3 casillas y empezarás a oírlos; el volumen baja con la distancia.
5. Zona privada: entra con A en la **sala de reuniones** (arriba a la izquierda). Arriba aparece
   «Sala de reuniones · privada». B, desde la puerta, ya no oye a A aunque esté a 3 casillas. Si B
   entra en la sala, se oyen aunque estén lejos dentro de ella. La **sala de concentración** (arriba a
   la derecha) funciona igual.
6. La barra inferior silencia el micrófono, apaga la cámara, comparte pantalla (los que están cerca la
   ven en un panel grande) y cambia de cámara, micrófono o altavoz.

Prueba automática del criterio de aceptación (3 navegadores con cámara simulada):

```bash
docker compose up -d --wait postgres redis mailpit livekit
pnpm --filter @pixels/web e2e media
```

Si ya tienes otra copia del proyecto en los puertos por defecto, puedes lanzar las pruebas en otros:
`WEB_PORT=5273 GAME_SERVER_PORT=2667 API_PORT=3101 CORS_ORIGIN=http://localhost:5273
API_PUBLIC_URL=http://localhost:3101 VITE_API_URL=http://localhost:3101
VITE_GAME_SERVER_URL=http://localhost:2667 pnpm --filter @pixels/web e2e`.

### Fase 1 · Mundo multijugador

1. `pnpm dev` y entra al mismo espacio con dos cuentas en **dos navegadores** (o una ventana normal y
   otra privada); ver Fase 3.
2. Muévete con flechas o WASD, o haz clic en una casilla del mapa: cada navegador ve al otro caminar.
3. Escribe en el chat (Enter abre el chat, Escape vuelve al juego): el mensaje aparece en ambos.
4. En desarrollo, arriba al centro se ven los FPS.

Pruebas automáticas:

```bash
pnpm test                                   # unitarias e integración (Vitest)
pnpm --filter @pixels/web e2e               # E2E con Playwright (cuentas, movimiento, chat y video)
```

Prueba de carga (50 bots paseando por la oficina). Los bots entran al último espacio creado (o al que
indiques con su id) firmando sus propios tickets con `TICKET_SECRET`:

```bash
# El servidor admite 25 jugadores por sala; para la prueba, súbelo:
ROOM_MAX_CLIENTS=60 pnpm --filter @pixels/game-server dev
pnpm --filter @pixels/game-server bots -- 50      # Ctrl+C para parar
pnpm --filter @pixels/game-server bots -- 50 0 <id-del-espacio>
```

Entra a ese espacio desde la web y mira el contador de FPS (objetivo: 30 o más). Medido en un MacBook Pro 2019 con GPU
integrada (Intel UHD 630): 60 FPS estables con 50 bots.

### Fase 0 · Entorno

1. `pnpm dev`
2. En la pantalla de login, el panel **Servicios (desarrollo)** muestra los 5 servicios en verde.
3. `docker compose ps` muestra `postgres`, `redis`, `mailpit` y `livekit` en marcha.

## Estructura

```
apps/
  web/            React 18 + Vite + Phaser 3 (src/pages: login, espacios, perfil, invitación;
                  src/game: escena, avatares, predicción; src/media: LiveKit y proximidad;
                  src/whiteboard: pizarra (Excalidraw, se descarga al abrirla);
                  src/ui: burbujas, controles y ajustes del espacio)
    public/assets/  tilesets y personajes (Kenney, CC0)
    e2e/            pruebas E2E con Playwright
  game-server/    Colyseus: una sala por espacio, autoridad del movimiento y el chat, última posición
                  y pizarras (reparte los cambios y los guarda)
    scripts/bots.ts bots para pruebas de carga
  api/            Fastify: login (Better Auth), /me, espacios, miembros, invitaciones, tickets para
                  entrar a un espacio y tokens de LiveKit
packages/
  db/             Prisma 7 + PostgreSQL: esquema (prisma/schema.prisma) y migraciones
  shared/         tipos, protocolo, roles, mapa, zonas, pizarras, proximidad, colisiones y caminos
                  tickets: firma de tickets entre servidores (solo servidores)
    src/maps/       mapas en formato Tiled JSON (plantillas)
tools/            scripts para preparar assets y generar el mapa inicial
docker-compose.yml   Postgres, Redis, Mailpit y LiveKit para desarrollo local
```

## Base de datos

El esquema está en `packages/db/prisma/schema.prisma` (usuarios y sesiones, espacios, mapas, miembros
con su rol y su última posición, invitaciones y el contenido de las pizarras). Tras cambiarlo:

```bash
pnpm --filter @pixels/db migrate:dev --name <cambio>   # crea y aplica la migración
pnpm --filter @pixels/db studio                         # explorar los datos en el navegador
```

`pnpm dev` aplica las migraciones pendientes al arrancar (`pnpm db:migrate`). Las pruebas de la API
usan otra base, `pixels_test`, que crean y vacían ellas mismas.

## Mapas

Los mapas de `packages/shared/src/maps/` son **plantillas** en formato **Tiled JSON**: al crear un
espacio se guarda una copia en la base de datos, y esa copia es la que usan el cliente (para dibujar)
y el servidor (para validar colisiones). Se pueden abrir y editar con
[Tiled](https://www.mapeditor.org/). Reglas:

- Tiles de 16 px. Capas de tiles visibles: `floor`, `walls`, `decor-below`, `furniture`.
- Capa de tiles `collision` (oculta): cualquier tile pintado bloquea el paso.
- Capa de objetos `spawn` con un punto llamado `spawn`: donde aparecen los jugadores.
- Capa de objetos `zones` (opcional): cada **rectángulo** es una zona privada. Su nombre es el que se
  muestra al entrar («Sala de reuniones · privada»). Se ajusta a casillas completas.
- Capa de objetos `whiteboards` (opcional): cada **rectángulo** es una pizarra (el juego la dibuja;
  normalmente va sobre una pared). Su nombre es el que se ve al abrirla. Lo dibujado se guarda con el
  id del objeto en Tiled: si se mueve la pizarra en el mapa, el contenido la sigue.

`office.json` se generó con `node tools/build-office-map.mjs`. Si lo editas en Tiled, no vuelvas a
ejecutar ese script (sobrescribiría tus cambios). Los cambios en la plantilla solo afectan a los
espacios nuevos: los que ya existen tienen su propia copia (para las pizarras, una migración se la
añadió a los espacios ya creados con la oficina).

`@pixels/shared` se consume desde el código fuente en desarrollo (condición de exportación `source`), así
que no hace falta compilarlo para `pnpm dev`, `pnpm test` ni `pnpm typecheck`. `pnpm build` lo compila a
`dist/` para producción.

## Scripts

| Script                                                 | Qué hace                                                |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `pnpm dev`                                             | Servicios de Docker + todas las apps en modo desarrollo |
| `pnpm dev:apps`                                        | Solo las apps (sin Docker)                              |
| `pnpm services:up` / `services:down` / `services:logs` | Gestiona los contenedores                               |
| `pnpm db:migrate`                                      | Aplica las migraciones pendientes                       |
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
- `TICKET_SECRET` debe ser el mismo en la API y en el servidor de juego. En producción son
  obligatorios `TICKET_SECRET`, `BETTER_AUTH_SECRET`, `API_PUBLIC_URL`, `SMTP_URL`, `LIVEKIT_API_KEY` y
  `LIVEKIT_API_SECRET`: sin ellos no arrancan.
- Cada asset gráfico o sonoro se registra en [`ASSETS_LICENSES.md`](./ASSETS_LICENSES.md) antes de añadirlo.

## Notas de versiones

- TypeScript está fijado en `~6.0` porque `typescript-eslint` todavía no soporta TypeScript 7.
- Phaser se mantiene en la rama 3.x (la que pide el plan), aunque ya existe Phaser 4.
- Excalidraw 0.18. Sus fuentes se sirven desde la propia web (`/excalidraw/fonts`, ver
  `apps/web/vite.config.ts`), salvo la de chino, japonés y coreano (12 MB), que se pide a su CDN.
