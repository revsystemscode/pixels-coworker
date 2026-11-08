# Decisiones del proyecto

Registro breve de decisiones de producto y de arquitectura. Lo más reciente, arriba.

## Cuentas y espacios (Fase 3)

| Tema               | Decisión                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Login              | **Better Auth** dentro de la API (Fastify + Prisma): Google y enlace mágico por correo. Gratis  |
| Entrar sin cuenta  | No: hace falta cuenta siempre, también los invitados                                            |
| Base de datos      | PostgreSQL con **Prisma 7** (`packages/db`), compartido por la API y el servidor de juego       |
| Sesión             | Cookie `httpOnly` de Better Auth (7 días). La web llama a la API con `credentials: 'include'`   |
| Correo             | SMTP con nodemailer. En desarrollo, **Mailpit**. El proveedor de producción se decide en Fase 6 |
| Roles              | Dueño, admin, miembro, invitado. Reglas en `packages/shared/src/roles.ts` (API y web)           |
| Invitaciones       | Enlace con token aleatorio; solo se guarda su hash. Rol miembro o invitado, caduca (1–30 días)  |
| Mapas              | Cada espacio guarda en la base de datos su copia de la plantilla (para el editor de la Fase 5)  |
| Salas              | Una sala de Colyseus por espacio (`filterBy(['spaceId'])`). Si se llena (25), no se abre otra   |
| Última posición    | Se guarda por miembro al salir; si ya no es una casilla válida, se aparece en el inicio         |
| Rutas de la web    | React Router 7 (la 8 exige React 19): `/login`, `/`, `/perfil`, `/s/:id`, `/i/:token`           |
| Límite de espacios | 20 espacios como dueño por persona                                                              |

- **Quién entra a la sala de un espacio.** La API comprueba que la persona es miembro y le da un
  _ticket_ firmado (HMAC-SHA256, 60 s) con su id, el espacio, su nombre, avatar y rol. El servidor de
  juego no deja entrar sin él, y nombre y avatar salen del ticket (no de lo que mande el cliente). Es
  el mismo mecanismo que el ticket de medios de la Fase 2; ahora los dos se firman con
  `TICKET_SECRET` y el tipo de ticket va dentro de la firma (uno no vale como el otro).
- **Expulsiones.** Al expulsar a alguien (o borrar el espacio), la API lo publica en Redis y el
  servidor de juego lo saca de la sala al momento. Si Redis falla, la persona sigue dentro hasta que
  salga, pero ya no puede volver a entrar.
- **La misma cuenta en dos pestañas**: se queda la nueva, en la posición de la vieja, y la vieja ve
  «Entraste a este espacio desde otra pestaña».
- **A quien no es miembro** la API le responde 404 (no se revela si el espacio existe). Los invitados
  no ven la lista de miembros, y el correo de los miembros solo lo ven el dueño y los admins.
- **Seguridad del login**:
  - Contra CSRF: la API rechaza peticiones que cambian algo si vienen de otro origen.
  - Tras el login solo se vuelve a la propia web (Better Auth comprueba `callbackURL`; lo
    forzamos también en las pruebas).
  - Límite de intentos por IP (5 enlaces por minuto): obligatorio en producción, apagado en
    desarrollo salvo con `AUTH_RATE_LIMIT=on`.
  - Los tokens de los enlaces mágicos se guardan como hash y sirven una sola vez.
- Un enlace de invitación no cambia el rol de quien ya es miembro (un enlace de invitado no degrada
  a un admin). Por ahora no se puede traspasar la propiedad de un espacio.

## Video por proximidad (Fase 2)

| Tema               | Decisión                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Radio              | 3 casillas (distancia euclídea). Volumen 1 hasta 1 casilla y baja hasta 0,3 en el borde        |
| Zonas privadas     | Rectángulos en la capa `zones` de Tiled. Dentro, se oye a toda la zona y a nadie de fuera      |
| Dónde va el video  | Burbujas sobre los avatares; la pantalla compartida, en un panel grande aparte                 |
| Margen al alejarse | 1,5 s conectado (en silencio y sin video) tras salir del radio: evita cortes en el borde       |
| Sala de LiveKit    | Una por sala de Colyseus (`world-<roomId>`); identidad = `sessionId` del jugador               |
| Pantalla previa    | Vista previa de cámara, nivel de micrófono y dispositivos. Se puede entrar sin cámara ni micro |

- **Quién puede pedir un token.** Al entrar, el servidor de juego entrega a cada jugador un _ticket_
  firmado (HMAC-SHA256, 60 s) con su `sessionId`. La API lo canjea por el token de LiveKit con esa
  identidad. Así nadie puede pedir un token en nombre de otro y las claves de LiveKit solo están en la
  API. El secreto lo comparten la API y el servidor de juego (desde la Fase 3 se llama
  `TICKET_SECRET`).
- **Quién recibe mi video.** Cada cliente calcula a quién tiene cerca con las posiciones del servidor
  y la regla común (`hearingVolume` en `@pixels/shared`). Con eso hace dos cosas: se suscribe solo a
  esas personas y **solo les da permiso** a ellas para suscribirse a sus pistas (permisos de pista de
  LiveKit, que aplica el servidor de LiveKit). Un cliente modificado no puede recibir el video ni el
  audio de quien está lejos. Límite conocido: durante el margen de 1,5 s el permiso sigue activo.
- El token no permite enviar datos por LiveKit ni cambiar metadatos; solo cámara, micrófono y
  pantalla (con su audio).
- Si LiveKit no está disponible, el mundo y el chat siguen funcionando; se avisa en la barra inferior.

## Datos del equipo (Fase 0–1)

| Tema                       | Decisión                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Nombre                     | pixels-coworker                                                                          |
| Usuarios por espacio (MVP) | Hasta 25 (`MAX_PLAYERS_PER_ROOM`). Se puede subir con `ROOM_MAX_CLIENTS` para pruebas.   |
| Arte                       | Kenney (CC0): Roguelike base + Roguelike Indoor (mapa) y RPG Urban (personajes)          |
| Movimiento                 | Por casillas de 16 px, 4 direcciones, 160 ms por casilla                                 |
| API                        | Fastify                                                                                  |
| MVP (fases 0–3) incluye    | Video por proximidad, compartir pantalla, zonas privadas, login con Google y **pizarra** |
| Pendiente                  | Hosting y presupuesto (antes de la Fase 6), dominio, proveedor de correo. Pizarra        |

La **pizarra colaborativa** estaba en la Fase 4 del plan original; el equipo la pidió en el MVP, así que
se adelanta. Habrá que decidir en qué fase entra (propuesta: al final de la Fase 3).

## Arquitectura del movimiento (Fase 1)

- **El servidor es la autoridad.** El cliente envía pasos (`{ dir, seq }`); el servidor comprueba
  colisiones contra la capa `collision` del mapa y la velocidad, y actualiza la posición.
- **Velocidad**: cubo de créditos (1 paso cada 160 ms con 15 % de margen, ráfagas de hasta 3). Tolera
  pasos que llegan juntos por la red sin dejar ir más rápido de forma sostenida.
- **Predicción propia**: el cliente aplica el paso al instante; cuando llega el estado, descarta los pasos
  confirmados (`seq`), reaplica los pendientes y corrige si no coincide.
- **Interpolación de los demás**: cada cambio de casilla se anima durante 160 ms; si se acumulan más de 3
  pasos o hay un salto, se teletransporta.
- **Clic para moverse**: búsqueda en anchura en el cliente; los pasos se envían uno a uno y el servidor
  valida cada uno igual que con el teclado.
- **Seguridad**: las opciones de `onCreate`/`onJoin` las envía el cliente, así que el mapa y el reloj de
  la sala nunca se leen de ahí. Nombre, avatar, pasos y chat se validan en el servidor
  (`packages/shared/src/protocol.ts`).
- Los jugadores pueden ocupar la misma casilla (evita que alguien bloquee una puerta).
