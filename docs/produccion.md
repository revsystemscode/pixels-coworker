# Producción

Todo corre en **un servidor** con Docker Compose (`deploy/docker-compose.prod.yml`):

| Servicio   | Qué es                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| `caddy`    | HTTPS automático (Let's Encrypt), la web, y reparte el 443 (también el TURN de LiveKit) |
| `api`      | API (Fastify). Solo escucha en `127.0.0.1:3001`                                         |
| `game`     | Servidor de juego (Colyseus). Solo escucha en `127.0.0.1:2567`                          |
| `livekit`  | Video y audio (SFU) con TURN                                                            |
| `postgres` | Base de datos (volumen `postgres-data`)                                                 |
| `redis`    | Avisos de la API al servidor de juego                                                   |
| `migrate`  | Aplica las migraciones al desplegar y termina                                           |
| `backup`   | Copia diaria de Postgres en `deploy/backups/` (14 días)                                 |

Direcciones (con `DOMAIN=pixels.example.com`):

| Dirección               | Va a                                           |
| ----------------------- | ---------------------------------------------- |
| `https://DOMAIN`        | Web                                            |
| `https://DOMAIN/api/…`  | API (`/api/auth/…` es el login)                |
| `https://DOMAIN/game/…` | Servidor de juego (WebSocket)                  |
| `https://rtc.DOMAIN`    | LiveKit (señalización)                         |
| `turn.DOMAIN:443` (TLS) | TURN de LiveKit, para redes que solo dejan 443 |

## 1. Servidor

- Linux con Docker y Docker Compose (por ejemplo, Ubuntu 24.04 en Hetzner). Para 100 personas por
  espacio con video, recomendable 4–8 vCPU y 8–16 GB de RAM. IPv4 pública.
- Cortafuegos: abrir solo lo necesario.

  ```bash
  ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
  ufw allow 7881/tcp && ufw allow 7882/udp && ufw allow 3478/udp   # LiveKit (WebRTC y TURN)
  ufw enable
  ```

  Postgres, Redis, la API y el juego no se publican hacia fuera.

## 2. DNS

Tres registros `A` (y `AAAA` si hay IPv6) apuntando al servidor: `DOMAIN`, `rtc.DOMAIN` y
`turn.DOMAIN`. En Cloudflare, **sin proxy** (nube gris): el video y el TURN no pasan por su proxy.

## 3. Correo

Cuenta en un proveedor SMTP (Postmark o Resend). Verifica el dominio del remitente añadiendo sus
registros SPF y DKIM al DNS. Pon la URL SMTP en `SMTP_URL` (ejemplos en `.env.production.example`).

## 4. Primer despliegue

```bash
git clone <repositorio> /opt/pixels && cd /opt/pixels/deploy
cp .env.production.example .env      # y rellénalo (secretos: openssl rand -base64 32)
chmod 600 .env
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez tarda unos minutos (compila las imágenes). Caddy pide los certificados al arrancar.
Comprueba:

```bash
curl https://DOMAIN/api/health    # API y sus dependencias: postgres, redis, livekit
curl https://DOMAIN/game/health   # servidor de juego: salas, jugadores y carga
```

La API y el servidor de juego **no arrancan** si la configuración no es de producción (secretos que
faltan o de ejemplo, claves de LiveKit del modo dev, direcciones sin HTTPS…): el error lo dice
(`docker compose -f docker-compose.prod.yml logs api`).

Login con Google (opcional): en la consola de Google, URI de redirección autorizada
`https://DOMAIN/api/auth/callback/google`.

## 5. Actualizar

En el servidor: `./deploy/deploy.sh` (por defecto, `origin/main`; o un commit o etiqueta). O desde
GitHub: **Actions → Deploy → Run workflow** (necesita los secretos que se indican en
`.github/workflows/deploy.yml`). El script construye, migra, reinicia lo que cambió y comprueba que
todo responde.

## 6. Copias de seguridad

Cada día, en `deploy/backups/pixels-AAAAMMDD-HHMMSS.sql.gz` (se guardan 14 días). **Cópialas fuera del
servidor** (por ejemplo, con `rclone` a un almacenamiento externo). Para restaurar una:

```bash
cd /opt/pixels/deploy
docker compose -f docker-compose.prod.yml stop api game
gunzip -c backups/pixels-AAAAMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U pixels -d pixels \
    -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' -f -
docker compose -f docker-compose.prod.yml start api game
```

## 7. Monitoreo y alertas

**Errores (Sentry).** Crea dos proyectos en [sentry.io](https://sentry.io) (el plan gratuito basta):
uno **Node.js** (API y servidor de juego) y uno **Browser/React** (web). Pon sus DSN en `SENTRY_DSN` y
`SENTRY_DSN_WEB` y vuelve a desplegar (el de la web se usa al compilar). Los errores de la web pasan
por la API (`/api/monitoring`), así que no hay que tocar la CSP. No se envían datos personales,
cookies, cabeceras, cuerpos ni la query de las URLs. Cada informe lleva la versión desplegada
(commit). En Sentry, activa las alertas por correo de «nuevo problema».

**Disponibilidad (monitor externo).** En Better Stack o UptimeRobot (gratis), monitores HTTP cada
1–3 minutos con alerta por correo:

| Monitor                           | Qué comprueba                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `https://DOMAIN/`                 | La web (200)                                                                          |
| `https://DOMAIN/api/health/ready` | API y sus dependencias: responde **503** si Postgres, Redis o LiveKit fallan          |
| `https://DOMAIN/game/health`      | Servidor de juego (200). Incluye la carga: `load.eventLoopP99Ms` (alto = va a saltos) |
| `https://rtc.DOMAIN`              | LiveKit (200)                                                                         |
| Certificado de `DOMAIN`           | Que no caduque (los monitores suelen tener esta opción)                               |

**Copias de seguridad.** Crea un monitor de «latido» (heartbeat) que espere un aviso cada 24 h y pon su
URL en `BACKUP_HEARTBEAT_URL`: si un día no se hace la copia, avisa.

**Logs.** `docker compose -f docker-compose.prod.yml logs -f api` (o `game`, `caddy`, `livekit`). Se
rotan solos (5 archivos de 10 MB por servicio). La versión desplegada se ve en `/api/health`.

**Espacio en disco.** Las imágenes viejas se borran al desplegar; las copias, a los 14 días. Revisa de
vez en cuando `df -h` (o activa la alerta de disco del proveedor del servidor).

## 8. Prueba de humo

Desde cualquier equipo con el repositorio (necesita un buzón que reciba el correo de login; con un
proveedor real, usa una cuenta propia a mano):

```bash
E2E_SMOKE=1 E2E_BASE_URL=https://DOMAIN/ E2E_API_URL=https://DOMAIN/api \
  pnpm --filter @pixels/web e2e smoke
```

Dos personas entran, se ven por video, chatean, se abre una pizarra y el editor, y se comprueba que la
política de seguridad (CSP) no bloquea nada.

## Probar la pila de producción en local

Con Docker (en macOS, OrbStack) se puede levantar exactamente lo mismo con `DOMAIN=pixels.localhost`
y certificados locales (`CADDY_GLOBAL_EXTRA=local_certs`), usando Mailpit de `pnpm services:up` para
el correo (`SMTP_URL=smtp://host.docker.internal:1025`) y `LIVEKIT_USE_EXTERNAL_IP=false`. Para la
prueba de humo, añade `E2E_IGNORE_HTTPS_ERRORS=1`. El LiveKit de desarrollo usa los mismos puertos:
páralo antes (`docker compose stop livekit`).
