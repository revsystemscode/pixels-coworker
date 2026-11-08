# Registro de assets y licencias

Cada asset (sprites, tiles, sonidos, fuentes, iconos) se registra aquí **antes** de añadirlo al repositorio.
Solo se aceptan assets propios o con licencia compatible con uso comercial (por ejemplo Kenney.nl CC0,
sprites LPC con su atribución, o arte encargado con cesión de derechos).

No se usa ningún asset, código, mapa, sonido, marca ni elemento de interfaz de Gather ni de otro producto.

| Asset                                 | Ruta en el repo                                                     | Autor / fuente                                                                       | Licencia | Atribución requerida | Fecha      |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | -------------------- | ---------- |
| Roguelike/RPG pack (suelos y paredes) | `apps/web/public/assets/tilesets/kenney-roguelike-base.png`         | Kenney · [OpenGameArt](https://opengameart.org/content/roguelikerpg-pack-1700-tiles) | CC0 1.0  | No (se agradece)     | 2026-11-06 |
| Roguelike Indoor pack (muebles)       | `apps/web/public/assets/tilesets/kenney-roguelike-indoor.png`       | Kenney · [OpenGameArt](https://opengameart.org/content/roguelike-indoor-pack)        | CC0 1.0  | No (se agradece)     | 2026-11-06 |
| RPG Urban Pack (solo personajes)      | `apps/web/public/assets/characters/kenney-rpg-urban-characters.png` | Kenney · [OpenGameArt](https://opengameart.org/content/rpg-urban-pack)               | CC0 1.0  | No (se agradece)     | 2026-11-06 |

Los PNG se procesan con `tools/prepare-assets.mjs` (recorte y relleno de 1 px; no se modifica el
dibujo). Créditos: gráficos de [Kenney](https://www.kenney.nl).

## Dependencias de código relevantes

| Proyecto                        | Uso               | Licencia                    |
| ------------------------------- | ----------------- | --------------------------- |
| Phaser 3                        | Motor 2D          | MIT                         |
| Colyseus                        | Servidor de juego | MIT                         |
| LiveKit server / livekit-client | Video y audio     | Apache-2.0                  |
| React                           | Interfaz          | MIT                         |
| Fastify                         | API               | MIT                         |
| Zustand                         | Estado de la UI   | MIT                         |
| Excalidraw                      | Pizarra           | MIT                         |
| Fuentes de Excalidraw           | Pizarra           | OFL 1.1 (Comic Shanns: MIT) |
| Playwright                      | Pruebas E2E       | Apache-2.0                  |

Las fuentes de Excalidraw no están en el repositorio: se copian del paquete `@excalidraw/excalidraw` al
compilar la web (Excalifont, Virgil, Nunito, Lilita One, Comic Shanns, Cascadia Code, Liberation Sans y
Assistant).
