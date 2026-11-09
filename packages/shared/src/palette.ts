/**
 * Tilesets que admiten los mapas (los dos packs de Kenney, CC0) y la paleta del editor: una
 * selección de tiles y piezas de varios tiles («sellos») con su capa y si bloquean el paso.
 */
export const TILE_SIZE_PX = 16;

export interface TilesetInfo {
  name: string;
  firstgid: number;
  columns: number;
  rows: number;
  imagewidth: number;
  imageheight: number;
  /** Ruta de la imagen en la web. */
  url: string;
}

export const TILESETS: readonly TilesetInfo[] = [
  {
    name: 'kenney-roguelike-base',
    firstgid: 1,
    columns: 57,
    rows: 31,
    imagewidth: 968,
    imageheight: 526,
    url: '/assets/tilesets/kenney-roguelike-base.png',
  },
  {
    name: 'kenney-roguelike-indoor',
    firstgid: 1 + 57 * 31,
    columns: 27,
    rows: 18,
    imagewidth: 458,
    imageheight: 305,
    url: '/assets/tilesets/kenney-roguelike-indoor.png',
  },
];

/** Mayor gid válido (último tile del último tileset). */
export const MAX_GID =
  TILESETS.at(-1)!.firstgid + TILESETS.at(-1)!.columns * TILESETS.at(-1)!.rows - 1;

/** gid de un tile del pack «base» o «indoor» (ids locales, empezando en 0). */
export const baseGid = (id: number) => TILESETS[0]!.firstgid + id;
export const indoorGid = (id: number) => TILESETS[1]!.firstgid + id;

/** Tileset y posición (en tiles) de un gid, para dibujarlo. */
export function tileSource(gid: number): { tileset: TilesetInfo; col: number; row: number } | null {
  for (let i = TILESETS.length - 1; i >= 0; i--) {
    const t = TILESETS[i]!;
    if (gid >= t.firstgid && gid < t.firstgid + t.columns * t.rows) {
      const local = gid - t.firstgid;
      return { tileset: t, col: local % t.columns, row: Math.floor(local / t.columns) };
    }
  }
  return null;
}

// --- Paredes ---

/**
 * Estilos de pared. Cada uno tiene la parte de arriba (según sus vecinas) y la cara que se ve debajo
 * de una pared horizontal (dos filas). En el pack, el estilo gris está 7 columnas a la derecha.
 */
export const WALL_STYLES = [
  { id: 'beige', name: 'Pared beige', offset: 0 },
  { id: 'gris', name: 'Pared gris', offset: 7 },
] as const;
export type WallStyleId = (typeof WALL_STYLES)[number]['id'];

export const WALL_TOP = {
  h: 698,
  v: 756,
  topLeft: 700,
  topRight: 701,
  upRight: 757,
  upLeft: 758,
  /** Segmento que solo continúa a la derecha. */
  endRight: 697,
  /** Segmento que solo continúa a la izquierda. */
  endLeft: 699,
} as const;
export const WALL_FACE = {
  upper: 873,
  lower: 868,
  upperL: 872,
  upperR: 874,
  lowerL: 869,
  lowerR: 871,
} as const;

// --- Paleta ---

export type PaletteCategory = 'suelo' | 'muebles' | 'asientos' | 'alfombras' | 'pared';
export type PaletteLayer = 'floor' | 'decor-below' | 'furniture';

export interface PaletteItem {
  id: string;
  name: string;
  category: PaletteCategory;
  layer: PaletteLayer;
  /** Filas de gids (0 = no tocar esa casilla). */
  tiles: number[][];
  blocks: boolean;
}

export const PALETTE_CATEGORIES: { id: PaletteCategory; name: string }[] = [
  { id: 'suelo', name: 'Suelos' },
  { id: 'muebles', name: 'Muebles' },
  { id: 'asientos', name: 'Sillas' },
  { id: 'alfombras', name: 'Alfombras' },
  { id: 'pared', name: 'En la pared' },
];

const floor = (id: string, name: string, gid: number): PaletteItem => ({
  id,
  name,
  category: 'suelo',
  layer: 'floor',
  tiles: [[gid]],
  blocks: false,
});
const furniture = (id: string, name: string, rows: number[][]): PaletteItem => ({
  id,
  name,
  category: 'muebles',
  layer: 'furniture',
  tiles: rows.map((r) => r.map(indoorGid)),
  blocks: true,
});
const seat = (id: string, name: string, local: number): PaletteItem => ({
  id,
  name,
  category: 'asientos',
  layer: 'furniture',
  tiles: [[indoorGid(local)]],
  blocks: false,
});
const rug = (id: string, name: string, rows: number[][]): PaletteItem => ({
  id,
  name,
  category: 'alfombras',
  layer: 'decor-below',
  tiles: rows.map((r) => r.map(indoorGid)),
  blocks: false,
});
/** Va sobre la cara de una pared (que ya bloquea). */
const onWall = (id: string, name: string, rows: number[][]): PaletteItem => ({
  id,
  name,
  category: 'pared',
  layer: 'furniture',
  tiles: rows.map((r) => r.map(indoorGid)),
  blocks: false,
});

export const PALETTE: readonly PaletteItem[] = [
  floor('piedra-gris', 'Piedra gris', baseGid(120)),
  floor('baldosa', 'Baldosa marrón', baseGid(119)),
  floor('piedra-beige', 'Piedra beige', baseGid(121)),
  floor('tablas', 'Tablas', baseGid(122)),
  floor('ladrillo', 'Ladrillo', baseGid(123)),
  floor('moqueta-azul', 'Moqueta azul', baseGid(467)),
  floor('moqueta-verde', 'Moqueta verde', baseGid(638)),
  floor('moqueta-naranja', 'Moqueta naranja', baseGid(809)),
  floor('cesped', 'Césped', baseGid(5)),
  floor('tierra', 'Tierra', baseGid(6)),
  floor('cemento', 'Cemento', baseGid(7)),
  floor('arena', 'Arena', baseGid(8)),
  floor('adoquin', 'Adoquín', baseGid(9)),

  furniture('escritorio', 'Escritorio', [[166, 167, 168, 169]]),
  furniture('escritorio-naranja', 'Escritorio naranja', [[193, 194, 195, 196]]),
  furniture('banco', 'Mesa alargada', [[220, 221, 222, 223]]),
  furniture('mesa', 'Mesa', [[112, 113, 114]]),
  furniture('mesa-2', 'Mesa de dos', [[112, 114]]),
  furniture('mesa-pequena', 'Mesa pequeña', [[115]]),
  furniture('mesa-grande', 'Mesa grande', [[27, 28, 29]]),
  furniture('mesa-ovalada', 'Mesa ovalada', [[30, 31]]),
  furniture('mesa-alta', 'Mesa alta', [[5], [32]]),
  furniture('mesa-redonda', 'Mesa redonda', [[7]]),
  furniture('reuniones-naranja', 'Mesa de reuniones', [
    [243, 244, 245],
    [298, 299, 300],
  ]),
  furniture('reuniones-naranja-tramo', 'Tramo de mesa de reuniones', [[244], [299]]),
  furniture('reuniones-verde', 'Mesa de reuniones verde', [
    [250, 251, 252],
    [305, 306, 307],
  ]),
  furniture('reuniones-verde-tramo', 'Tramo de mesa verde', [[251], [306]]),
  furniture('estanteria', 'Estantería', [[478, 479, 480]]),
  furniture('planta', 'Planta', [[16]]),
  furniture('planta-2', 'Planta alta', [[17]]),
  furniture('piano', 'Piano', [
    [239, 240],
    [266, 267],
  ]),
  furniture('cocina', 'Encimera de cocina', [[329, 330, 331, 332, 333]]),
  furniture('armario-cocina', 'Armario de cocina', [[324]]),
  furniture('cajonera-cocina', 'Cajonera de cocina', [[325]]),

  seat('silla-frente', 'Silla (de frente)', 54),
  seat('silla-espalda', 'Silla (de espaldas)', 55),
  seat('silla-derecha', 'Silla (mira a la derecha)', 56),
  seat('silla-izquierda', 'Silla (mira a la izquierda)', 57),
  seat('silla-madera-frente', 'Silla de madera (de frente)', 108),
  seat('silla-madera-espalda', 'Silla de madera (de espaldas)', 109),
  seat('silla-madera-derecha', 'Silla de madera (mira a la derecha)', 110),
  seat('silla-madera-izquierda', 'Silla de madera (mira a la izquierda)', 111),
  seat('silla-blanca-frente', 'Silla blanca (de frente)', 216),
  seat('silla-blanca-espalda', 'Silla blanca (de espaldas)', 217),
  seat('silla-blanca-derecha', 'Silla blanca (mira a la derecha)', 218),
  seat('silla-blanca-izquierda', 'Silla blanca (mira a la izquierda)', 219),
  seat('taburete', 'Taburete', 97),
  seat('puf', 'Puf', 98),

  rug('alfombra-naranja', 'Alfombra naranja', [
    [23, 24, 25],
    [50, 51, 52],
  ]),
  rug('alfombra-verde', 'Alfombra verde', [
    [131, 132, 133],
    [158, 159, 160],
  ]),
  rug('alfombrilla-azul', 'Alfombrilla azul', [[394, 395, 396]]),
  rug('alfombrilla-naranja', 'Alfombrilla naranja', [[421, 422, 423]]),
  rug('alfombrilla-verde', 'Alfombrilla verde', [[448, 449, 450]]),
  rug('alfombrilla-beige', 'Alfombrilla beige', [[475, 476, 477]]),

  onWall('cuadro-verde', 'Cuadro verde', [[343]]),
  onWall('cuadro-ancho', 'Cuadro apaisado', [[344, 345]]),
  onWall('cuadro-naranja', 'Cuadro naranja', [[370]]),
  onWall('cuadro-ancho-2', 'Cuadro apaisado claro', [[371, 372]]),
  onWall('cuadro-azul', 'Cuadro azul', [[397]]),
  onWall('marcos', 'Marcos pequeños', [[340, 341]]),
  onWall('estandarte-verde', 'Estandarte verde', [[424], [451]]),
  onWall('estandarte-naranja', 'Estandarte naranja', [[425], [452]]),
  onWall('espejo', 'Espejo', [[400], [427]]),
  onWall('cartel', 'Cartel', [[18]]),
];

/** gids de muebles que bloquean el paso. */
export const BLOCKING_GIDS: ReadonlySet<number> = new Set(
  PALETTE.filter((p) => p.blocks).flatMap((p) => p.tiles.flat().filter((g) => g !== 0)),
);
/** gids de la capa de muebles que se pueden pisar (sillas, cuadros…). */
export const WALKABLE_GIDS: ReadonlySet<number> = new Set(
  PALETTE.filter((p) => !p.blocks && p.layer === 'furniture').flatMap((p) => p.tiles.flat()),
);
