// Prepara los PNG de Kenney (CC0) para el juego. Uso:
//   node tools/prepare-assets.mjs <carpeta-roguelike-base> <carpeta-roguelike-indoor> <carpeta-rpg-urban>
// Cada carpeta es un pack descomprimido tal como viene de OpenGameArt/Kenney.
// Fuentes y licencias: ver ASSETS_LICENSES.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const [baseDir, indoorDir, urbanDir] = process.argv.slice(2);
if (!baseDir || !indoorDir || !urbanDir) {
  console.error(
    'Uso: node tools/prepare-assets.mjs <roguelike-base> <roguelike-indoor> <rpg-urban>',
  );
  process.exit(1);
}

const OUT = new URL('../apps/web/public/assets/', import.meta.url).pathname;
mkdirSync(join(OUT, 'tilesets'), { recursive: true });
mkdirSync(join(OUT, 'characters'), { recursive: true });

const read = (path) => PNG.sync.read(readFileSync(path));
const write = (png, path) => writeFileSync(path, PNG.sync.write(png));

/** Copia un rectángulo de src a una imagen nueva de w×h (transparente fuera de src). */
function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      src.data.copy(out.data, di, si, si + 4);
    }
  }
  return out;
}

// 1) Roguelike base: suelos y paredes. 968×526 = 57×31 tiles de 16 px con 1 px de separación.
const base = read(join(baseDir, 'Spritesheet/roguelikeSheet_transparent.png'));
write(base, join(OUT, 'tilesets/kenney-roguelike-base.png'));

// 2) Roguelike indoor: muebles. Mide 457 px de ancho pero 27 columnas con separación 1 piden 458;
//    se rellena 1 px para que Phaser y Tiled cuenten bien las columnas.
const indoor = read(join(indoorDir, 'Spritesheet/roguelikeIndoor_transparent.png'));
write(
  crop(indoor, 0, 0, 27 * 17 - 1, 18 * 17 - 1),
  join(OUT, 'tilesets/kenney-roguelike-indoor.png'),
);

// 3) RPG Urban: solo los personajes (columnas 23–26 = izquierda, abajo, arriba, derecha).
//    6 personajes × 3 filas (quieto, paso 1, paso 2). Resultado: 4×18 frames de 16 px.
const urban = read(join(urbanDir, 'Tilemap/tilemap_packed.png'));
write(
  crop(urban, 23 * 16, 0, 4 * 16, 18 * 16),
  join(OUT, 'characters/kenney-rpg-urban-characters.png'),
);

console.log('Assets listos en', OUT);
