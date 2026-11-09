# Decisiones del proyecto

Registro breve de decisiones de producto y de arquitectura. Lo más reciente, arriba.

## Editor de mapas (Fase 5)

| Tema             | Decisión                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Alcance          | **Editor completo en el navegador** (canvas 2D propio), más importar y exportar Tiled JSON        |
| Quién edita      | **Dueño y admins**                                                                                |
| Cómo se aplica   | **Borrador** que se guarda solo y botón **Publicar**, que cambia el mapa en caliente              |
| Paleta           | ~60 piezas elegidas de los packs de Kenney, ya marcadas como «bloquea» o no. Dos estilos de pared |
| Tamaño           | De 8 a 100 casillas de lado                                                                       |
| Fuera de alcance | Subir arte o tilesets propios, historial de versiones, editar entre varias personas, móvil        |

- **Un solo formato**: el editor lee Tiled JSON (`parseTiledForEditing`, que también valida lo que se
  importa) y escribe el mismo formato que `tools/build-office-map.mjs`. La oficina sale idéntica al
  leerla y escribirla (hay una prueba), así que los mapas viejos y los nuevos son iguales.
- **Paredes automáticas**: se guarda qué casillas son pared y de qué estilo; la parte de arriba se elige
  según las vecinas y debajo de cada pared horizontal se ponen dos filas de cara (la misma lógica que el
  script de la oficina, ahora compartida). Los tiles puestos a mano en la capa de paredes se respetan.
- **Colisión calculada**: al pintar, cada casilla bloquea si tiene pared o un mueble que bloquea. Los
  tiles que no están en la paleta (de un mapa importado) conservan su colisión, y hay pinceles para
  bloquear o desbloquear a mano.
- **Borrador aparte** (tabla `map_drafts`): guardarlo no cambia la versión del mapa publicado, así que
  nadie lo vuelve a descargar hasta que se publica.
- **Publicar en caliente**: la API guarda el mapa, borra el contenido de pizarras y objetos que ya no
  están y avisa al servidor de juego por Redis (`map-updated`). La sala usa el mapa nuevo al momento,
  recoloca a quien quedó sobre una casilla bloqueada y cierra pizarras y mesas que ya no existen. La web
  vuelve a montar el juego con el mapa nuevo; la llamada de video sigue.
- **Ids estables**: pizarras y objetos guardan su contenido con el id del objeto en Tiled, que nunca se
  reutiliza (`nextobjectid`). Así, mover una pizarra no pierde lo dibujado y un objeto nuevo no hereda
  contenido viejo.
- El contenido inicial de un objeto (el del mapa) solo se ve mientras nadie lo cambie desde el juego.
- El editor se abre en otra pestaña y se carga aparte (~10 KB comprimido), así que no pesa en el juego.

## Interactividad y juego (Fase 4)

| Tema                | Decisión                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Reacciones          | 6 emojis (teclas 1–6) durante 3 s sobre el avatar y en su burbuja de video. Mano levantada (H) |
| Personalizar avatar | Mismos 6 personajes de Kenney, con color de camiseta, pelo y piel. Sin arte nuevo              |
| Objetos             | Enlace, video y nota en la capa `objects` de Tiled. Se abren como las pizarras                 |
| Quién edita objetos | **Dueño y admins**. Miembros e invitados los ven pero no los cambian                           |
| Video               | Solo **YouTube** (dominio sin cookies) y **Vimeo**. Cada persona lo ve por su cuenta           |
| Minijuego           | **Tres en raya** en una mesa de la oficina: dos juegan y quien esté cerca mira                 |

- **Reacciones**: pasan por el servidor de juego con límite de frecuencia. La mano levantada es parte
  del estado del jugador (la ve quien entra después); las reacciones solo se reparten en el momento.
  Se muestran también en la burbuja de video porque, si alguien está cerca, la burbuja tapa la cabeza.
- **Aspecto del avatar en un número**: personaje y colores se guardan juntos en `users.avatar`
  (`encodeAvatar`). Así no cambian la base de datos, el ticket ni el estado de la sala, y los avatares
  de antes siguen valiendo. El navegador repinta la hoja de Kenney: solo cambia los colores exactos
  de cada parte y dentro de su zona (pelo arriba, camiseta en el torso), porque algunos zapatos son del
  mismo color que el pelo. El obrero no tiene pelo que cambiar (lleva casco).
- **Objetos editables**: el contenido se guarda en `space_objects`; si no hay fila, vale el del mapa
  (propiedad `value` en Tiled). El servidor valida siempre: enlaces solo `http`/`https` y sin usuario ni
  contraseña; videos solo como `youtube:<id>` o `vimeo:<id>`, y el reproductor se construye con un id
  comprobado (nunca se mete una URL cualquiera en un iframe). El enlace se abre en otra pestaña tras
  mostrar el dominio, con `noopener`.
- **Cambios de rol**: la API avisa al servidor de juego (`role-changed` por Redis), así que un admin que
  pasa a miembro deja de poder editar sin salir de la sala, y su interfaz se actualiza.
- **Tres en raya**: la partida vive en memoria en la sala (no se guarda). El servidor valida asientos,
  turnos, casillas y distancia. Si alguien se levanta o se aleja a mitad de partida, se empieza de cero;
  en la revancha empieza quien no empezó la anterior.
- **Mapas de los espacios existentes**: una migración les pone los objetos y la mesa, pero solo a los
  que siguen siendo exactamente la plantilla anterior (un mapa editado no se pisa).
- **Pendiente para la Fase 6**: cuando se añada una política de seguridad de contenido (CSP), permitir
  `frame-src` de `www.youtube-nocookie.com` y `player.vimeo.com`.

## Pizarra (cierre del MVP)

| Tema           | Decisión                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Librería       | **Excalidraw** (MIT, en español). tldraw se descartó: en producción pide una licencia de pago  |
| Dónde está     | Objetos del mapa (capa `whiteboards` de Tiled). La oficina trae dos: reuniones y oficina       |
| Cómo se abre   | A 2 casillas o menos: botón «Abrir», tecla E o clic en la pizarra (camina hasta ella)          |
| Quién dibuja   | Todos los miembros, también los invitados                                                      |
| Sincronización | Por la sala de Colyseus del espacio. Sin servicios nuevos                                      |
| Guardado       | Postgres (tabla `whiteboards`), 2 s después del último cambio y al cerrarla la última persona  |
| Límites        | 3000 elementos y 2 MB por pizarra, 60 KB por elemento. Sin imágenes ni contenido incrustado    |
| Carga          | Excalidraw solo se descarga al abrir la primera pizarra (~1 MB comprimido); el mapa no lo paga |

- **Cómo se combinan los cambios.** Cada elemento lleva `version` y `versionNonce`. Si dos personas
  cambian el mismo elemento, gana la versión más alta y, si empatan, el `versionNonce` más bajo: la
  misma regla que `reconcileElements` de Excalidraw, así el servidor y los navegadores llegan al mismo
  resultado. A quien envía algo atrasado, el servidor le devuelve la versión buena.
- **El servidor no se fía del navegador**: comprueba que estás cerca para abrir la pizarra (y la
  cierra si te alejas), que la tienes abierta para enviar cambios, la forma y el tamaño de cada
  elemento, y quita enlaces que no sean http(s) o mailto (un `javascript:` se ejecutaría al hacer clic
  en la pizarra de otra persona). Si la pizarra se llena, avisa y vuelve a sincronizar a quien no cupo.
  Borrar siempre se puede.
- **Borrados**: se envían como elementos con `isDeleted` (así llegan a todos). Al volver a cargar una
  pizarra que nadie tenía abierta se descartan, para que no ocupen sitio para siempre.
- **Tamaño de los mensajes**: Colyseus solo acepta 4 KB por mensaje del cliente por defecto; se sube a
  256 KB (un trazo largo a mano ronda los 50 KB) y el cliente parte los cambios grandes en trozos.
- Los espacios creados antes de la pizarra la reciben con una migración (solo los de la plantilla de
  oficina).

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

| Tema                    | Decisión                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Nombre                  | pixels-coworker                                                                             |
| Usuarios por espacio    | Hasta 100 (`MAX_PLAYERS_PER_ROOM`, desde la Fase 6; antes 25). Probado con el espacio lleno |
| Arte                    | Kenney (CC0): Roguelike base + Roguelike Indoor (mapa) y RPG Urban (personajes)             |
| Movimiento              | Por casillas de 16 px, 4 direcciones, 160 ms por casilla                                    |
| API                     | Fastify                                                                                     |
| MVP (fases 0–3) incluye | Video por proximidad, compartir pantalla, zonas privadas, login con Google y **pizarra**    |
| Pendiente               | Hosting y presupuesto (antes de la Fase 6), dominio, proveedor de correo                    |

La **pizarra colaborativa** estaba en la Fase 4 del plan original; el equipo la pidió en el MVP, así que
se adelantó y se hizo justo después de la Fase 3 (ver «Pizarra»).

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
