import type { TiledMap } from './map.js';

export interface TestZone {
  name: string;
  /** En tiles. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crea un TiledMap pequeño a partir de un dibujo ASCII, para pruebas.
 * '#' = bloqueado, '.' = libre, 'S' = libre y punto de aparición.
 * `zones` (en tiles) añade la capa de zonas privadas.
 */
export function tiledFromAscii(rows: string[], tileSize = 16, zones: TestZone[] = []): TiledMap {
  const width = rows[0]!.length;
  const height = rows.length;
  const data: number[] = [];
  let spawn = { x: 0, y: 0 };
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      data.push(c === '#' ? 1 : 0);
      if (c === 'S') spawn = { x, y };
    }),
  );
  return {
    width,
    height,
    tilewidth: tileSize,
    tileheight: tileSize,
    layers: [
      { type: 'tilelayer', name: 'collision', width, height, data },
      {
        type: 'objectgroup',
        name: 'spawn',
        objects: [
          { name: 'spawn', point: true, x: spawn.x * tileSize + 8, y: spawn.y * tileSize + 8 },
        ],
      },
      ...(zones.length
        ? [
            {
              type: 'objectgroup' as const,
              name: 'zones',
              objects: zones.map((z, i) => ({
                id: i + 1,
                name: z.name,
                x: z.x * tileSize,
                y: z.y * tileSize,
                width: z.width * tileSize,
                height: z.height * tileSize,
              })),
            },
          ]
        : []),
    ],
  };
}
