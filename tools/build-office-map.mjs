// Genera el mapa inicial de la oficina en formato Tiled JSON:
//   node tools/build-office-map.mjs
// El resultado (packages/shared/src/maps/office.json) se puede abrir y seguir editando en Tiled.
// Si se edita en Tiled, NO volver a ejecutar este script (sobrescribiría los cambios).
import { writeFileSync } from 'node:fs';

const T = 16;

// '#' pared · '.' suelo de madera · ',' suelo de baldosa · ' ' exterior
// Las dos filas bajo una pared horizontal se convierten en la cara de la pared (no se pisan).
const LAYOUT = [
  '########################################',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,#..........#,,,,,,,,,,,,,,#',
  '#####,,#######..........#########,,#####',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '########################################',
];

const W = LAYOUT[0].length;
const H = LAYOUT.length;
if (LAYOUT.some((row) => row.length !== W)) throw new Error('Todas las filas deben medir lo mismo');

// --- Tilesets (ids locales, 0-based) ---
const BASE = { firstgid: 1, columns: 57, rows: 31 };
const INDOOR = { firstgid: 1 + 57 * 31, columns: 27, rows: 18 };
const base = (id) => BASE.firstgid + id;
const indoor = (id) => INDOOR.firstgid + id;

const FLOOR = { '.': base(120), ',': base(119) };
const WALL = {
  h: 698,
  v: 756,
  topLeft: 700,
  topRight: 701,
  upRight: 757,
  upLeft: 758,
  endRight: 697, // segmento que solo continúa a la derecha
  endLeft: 699, // segmento que solo continúa a la izquierda
};
const FACE = { upper: 873, lower: 868, upperL: 872, upperR: 874, lowerL: 869, lowerR: 871 };

const cell = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? ' ' : LAYOUT[y][x]);
const isWall = (x, y) => cell(x, y) === '#';

const layer = () => new Array(W * H).fill(0);
const floor = layer();
const walls = layer();
const furniture = layer();
const decor = layer();
const collision = layer();
const idx = (x, y) => y * W + x;

// Suelo
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = cell(x, y);
    if (FLOOR[c]) floor[idx(x, y)] = FLOOR[c];
  }

// Paredes (parte superior) según sus vecinas
function wallTile(x, y) {
  const u = isWall(x, y - 1);
  const d = isWall(x, y + 1);
  const l = isWall(x - 1, y);
  const r = isWall(x + 1, y);
  if (u && d) return WALL.v;
  if (l && r) return WALL.h;
  if (r && d) return WALL.topLeft;
  if (l && d) return WALL.topRight;
  if (u && r) return WALL.upRight;
  if (u && l) return WALL.upLeft;
  if (r) return WALL.endRight;
  if (l) return WALL.endLeft;
  return WALL.v;
}

// Una pared genera cara debajo si es horizontal (la de abajo no es pared).
const facesAt = new Map(); // idx -> 'upper' | 'lower'
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (!isWall(x, y)) continue;
    walls[idx(x, y)] = base(wallTile(x, y));
    collision[idx(x, y)] = 1;
    if (isWall(x, y + 1)) continue;
    for (const [dy, level] of [
      [1, 'upper'],
      [2, 'lower'],
    ]) {
      const fy = y + dy;
      if (fy >= H || isWall(x, fy)) break;
      facesAt.set(idx(x, fy), level);
    }
  }

for (const [i, level] of facesAt) {
  const x = i % W;
  const y = Math.floor(i / W);
  const sameLeft = facesAt.get(idx(x - 1, y)) === level || isWall(x - 1, y);
  const sameRight = facesAt.get(idx(x + 1, y)) === level || isWall(x + 1, y);
  let id = level === 'upper' ? FACE.upper : FACE.lower;
  if (!sameLeft) id = level === 'upper' ? FACE.upperL : FACE.lowerL;
  else if (!sameRight) id = level === 'upper' ? FACE.upperR : FACE.lowerR;
  walls[i] = base(id);
  collision[i] = 1;
}

// --- Muebles (pack indoor) ---
function put(target, x, y, gid, { block = true } = {}) {
  if (isWall(x, y) || facesAt.has(idx(x, y))) throw new Error(`Mueble sobre pared en ${x},${y}`);
  target[idx(x, y)] = gid;
  if (block) collision[idx(x, y)] = 1;
}
function putRect(target, x0, y0, rows, opts) {
  rows.forEach((row, dy) =>
    row.forEach((id, dx) => id != null && put(target, x0 + dx, y0 + dy, indoor(id), opts)),
  );
}

// Sala de reuniones (arriba a la izquierda): mesa larga con sillas
putRect(furniture, 3, 4, [
  [243, 244, 244, 244, 244, 244, 245],
  [298, 299, 299, 299, 299, 299, 300],
]);
for (let x = 3; x <= 9; x += 2) {
  put(furniture, x, 3, indoor(55), { block: false });
  put(furniture, x, 6, indoor(109), { block: false });
}
put(furniture, 1, 3, indoor(16));
put(furniture, 12, 3, indoor(17));

// Cocina / zona común (arriba al centro)
putRect(furniture, 15, 3, [[329, 330, 331, 332, 333, 329, 330]]);
put(furniture, 23, 3, indoor(16));
putRect(furniture, 16, 6, [[112, 113, 114]]);
put(furniture, 15, 6, indoor(57), { block: false });
put(furniture, 19, 6, indoor(56), { block: false });

// Sala de concentración (arriba a la derecha): estanterías y mesas
putRect(furniture, 26, 3, [[478, 479, 480, 478, 479, 480]]);
put(furniture, 38, 3, indoor(17));
for (const x of [27, 31, 35]) {
  put(furniture, x, 6, indoor(115));
  put(furniture, x, 7, indoor(109), { block: false });
}

// Oficina abierta: tres filas de escritorios
for (const [x0, y0] of [
  [4, 13],
  [4, 18],
  [16, 13],
  [16, 18],
  [28, 13],
  [28, 18],
]) {
  putRect(furniture, x0, y0, [[166, 167, 168, 169]]);
  for (let dx = 0; dx < 4; dx++) put(furniture, x0 + dx, y0 + 1, indoor(109), { block: false });
}

// Plantas en las esquinas de la oficina
for (const [x, y] of [
  [1, 11],
  [38, 11],
  [1, 24],
  [38, 24],
])
  put(furniture, x, y, indoor(16));

// Alfombra en la zona de paso
putRect(
  decor,
  17,
  22,
  [
    [23, 24, 24, 24, 25],
    [50, 51, 51, 51, 52],
  ],
  { block: false },
);

// --- Exportar en formato Tiled JSON ---
const tileLayer = (id, name, data, extra = {}) => ({
  id,
  name,
  type: 'tilelayer',
  x: 0,
  y: 0,
  width: W,
  height: H,
  opacity: 1,
  visible: true,
  data,
  ...extra,
});

const spawn = { x: 19, y: 16 };

// Zonas privadas (en tiles, incluyen la cara de la pared). Quien está dentro solo oye a los de su zona.
const ZONES = [
  { name: 'Sala de reuniones', x: 1, y: 1, width: 12, height: 7 },
  { name: 'Sala de concentración', x: 25, y: 1, width: 14, height: 7 },
];
// Pizarras (en tiles), sobre la cara de la pared. Se abren desde 2 casillas o menos.
const WHITEBOARDS = [
  { name: 'Pizarra de reuniones', x: 5, y: 1, width: 4, height: 2 },
  { name: 'Pizarra de la oficina', x: 9, y: 9, width: 4, height: 2 },
];
for (const b of WHITEBOARDS)
  for (let y = b.y; y < b.y + b.height; y++)
    for (let x = b.x; x < b.x + b.width; x++)
      if (!facesAt.has(idx(x, y)))
        throw new Error(`La pizarra "${b.name}" no está sobre una pared`);

const rectObjects = (rects, firstId, type) =>
  rects.map((r, i) => ({
    id: firstId + i,
    name: r.name,
    type,
    x: r.x * T,
    y: r.y * T,
    width: r.width * T,
    height: r.height * T,
    rotation: 0,
    visible: true,
  }));
const objectLayer = (id, name, objects, extra = {}) => ({
  id,
  name,
  type: 'objectgroup',
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
  draworder: 'topdown',
  objects,
  ...extra,
});

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 9,
  nextobjectid: 2 + ZONES.length + WHITEBOARDS.length,
  layers: [
    tileLayer(1, 'floor', floor),
    tileLayer(2, 'walls', walls),
    tileLayer(3, 'decor-below', decor),
    tileLayer(4, 'furniture', furniture),
    // Capa de colisión: cualquier tile distinto de 0 bloquea. Oculta en el juego.
    tileLayer(
      5,
      'collision',
      collision.map((v) => (v ? base(1) : 0)),
      { visible: false, opacity: 0.5 },
    ),
    {
      id: 6,
      name: 'spawn',
      type: 'objectgroup',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      draworder: 'topdown',
      objects: [
        {
          id: 1,
          name: 'spawn',
          type: '',
          point: true,
          x: spawn.x * T + T / 2,
          y: spawn.y * T + T / 2,
          width: 0,
          height: 0,
          rotation: 0,
          visible: true,
        },
      ],
    },
    objectLayer(7, 'zones', rectObjects(ZONES, 2, 'private'), { opacity: 0.4, visible: false }),
    // Pizarras: el juego las dibuja (el pack de Kenney no trae ninguna).
    objectLayer(8, 'whiteboards', rectObjects(WHITEBOARDS, 2 + ZONES.length, 'whiteboard')),
  ],
  tilesets: [
    {
      firstgid: BASE.firstgid,
      name: 'kenney-roguelike-base',
      image: '../../../../apps/web/public/assets/tilesets/kenney-roguelike-base.png',
      imagewidth: 968,
      imageheight: 526,
      tilewidth: T,
      tileheight: T,
      spacing: 1,
      margin: 0,
      columns: BASE.columns,
      tilecount: BASE.columns * BASE.rows,
    },
    {
      firstgid: INDOOR.firstgid,
      name: 'kenney-roguelike-indoor',
      image: '../../../../apps/web/public/assets/tilesets/kenney-roguelike-indoor.png',
      imagewidth: 458,
      imageheight: 305,
      tilewidth: T,
      tileheight: T,
      spacing: 1,
      margin: 0,
      columns: INDOOR.columns,
      tilecount: INDOOR.columns * INDOOR.rows,
    },
  ],
};

const out = new URL('../packages/shared/src/maps/office.json', import.meta.url);
writeFileSync(out, JSON.stringify(map) + '\n');
console.log(`Mapa ${W}×${H} escrito en ${out.pathname}`);
