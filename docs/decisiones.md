# Decisiones del proyecto

Registro breve de decisiones de producto y de arquitectura. Lo más reciente, arriba.

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
  API. El secreto (`MEDIA_TICKET_SECRET`) lo comparten la API y el servidor de juego.
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
| Pendiente                  | Hosting y presupuesto (antes de la Fase 6), dominio. En qué fase entra la pizarra        |

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
