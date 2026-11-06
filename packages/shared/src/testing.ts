import type { TiledMap } from './map.js';

/**
 * Crea un TiledMap pequeño a partir de un dibujo ASCII, para pruebas.
 * '#' = bloqueado, '.' = libre, 'S' = libre y punto de aparición.
 */
export function tiledFromAscii(rows: string[], tileSize = 16): TiledMap {
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
    ],
  };
}
