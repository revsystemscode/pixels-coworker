# Decisiones del proyecto

Registro breve de decisiones de producto y de arquitectura. Lo más reciente, arriba.

## Datos del equipo (Fase 0–1)

| Tema                       | Decisión                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Nombre                     | pixels-coworker                                                                          |
| Usuarios por espacio (MVP) | Hasta 25 (`MAX_PLAYERS_PER_ROOM`). Se puede subir con `ROOM_MAX_CLIENTS` para pruebas.   |
| Arte                       | Kenney (CC0): Roguelike base + Roguelike Indoor (mapa) y RPG Urban (personajes)          |
| Movimiento                 | Por casillas de 16 px, 4 direcciones, 160 ms por casilla                                 |
| API                        | Fastify                                                                                  |
| MVP (fases 0–3) incluye    | Video por proximidad, compartir pantalla, zonas privadas, login con Google y **pizarra** |
| Pendiente                  | Hosting y presupuesto (antes de la Fase 6), dominio                                      |

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
