import { parseWorldMap, type TiledMap } from './map.js';
import { isObjectKind, parseObjectValue, type MapObjectKind } from './objects.js';
import {
  BLOCKING_GIDS,
  MAX_GID,
  TILESETS,
  TILE_SIZE_PX,
  WALKABLE_GIDS,
  WALL_FACE,
  WALL_STYLES,
  WALL_TOP,
  baseGid,
} from './palette.js';
import type { Point } from './tiles.js';

/**
 * Mapa en el formato del editor: capas como arrays y rectángulos en casillas. Se lee de un Tiled JSON
 * (validándolo: también sirve para importar) y se vuelve a escribir en el mismo formato que
 * `tools/build-office-map.mjs`, así que la oficina sale idéntica tras leerla y escribirla.
 */
export const TILE_LAYERS = ['floor', 'walls', 'decor-below', 'furniture'] as const;
export type TileLayer = (typeof TILE_LAYERS)[number];

export const MAP_MIN_SIZE = 8;
export const MAP_MAX_SIZE = 100;
export const MAP_NAME_MAX_LENGTH = 60;
const MAX_RECTS = { zones: 50, whiteboards: 20, objects: 100 } as const;

export interface MapRect {
  /** Id del objeto en Tiled: el contenido de pizarras y objetos se guarda con él. */
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapObjectRect extends MapRect {
  kind: MapObjectKind;
  /** Contenido inicial (propiedad `value`). */
  value: string;
}

export interface EditableMap {
  width: number;
  height: number;
  layers: Record<TileLayer, number[]>;
  /** 1 = bloqueado. */
  collision: number[];
  spawn: Point;
  zones: MapRect[];
  whiteboards: MapRect[];
  objects: MapObjectRect[];
  /** Siguiente id libre para objetos nuevos (nunca se reutilizan). */
  nextObjectId: number;
}

export type ParseResult = { ok: true; map: EditableMap } | { ok: false; error: string };

// --- Leer (y validar) un Tiled JSON ---

const KIND_NAMES: Record<MapObjectKind, string> = {
  link: 'Enlace',
  video: 'Video',
  note: 'Nota',
  game: 'Mesa de juego',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown): v is number => Number.isInteger(v);

class MapError extends Error {}
const fail = (message: string): never => {
  throw new MapError(message);
};

const cleanName = (raw: unknown, fallback: string) => {
  // eslint-disable-next-line no-control-regex
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001F\u007F]/g, '').trim() : '';
  return name.slice(0, MAP_NAME_MAX_LENGTH) || fallback;
};

function readTileLayer(layers: unknown[], name: string, size: number, required: boolean) {
  const layer = layers.find((l) => isObj(l) && l.name === name);
  if (!layer) {
    if (required) fail(`Falta la capa de tiles "${name}".`);
    return new Array<number>(size).fill(0);
  }
  if (!isObj(layer) || layer.type !== 'tilelayer') fail(`"${name}" debe ser una capa de tiles.`);
  const data = (layer as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    fail(`La capa "${name}" está comprimida: expórtala sin compresión (formato CSV o JSON).`);
  }
  const values = data as unknown[];
  if (values.length !== size) fail(`La capa "${name}" no coincide con el tamaño del mapa.`);
  return values.map((v) => {
    if (!isInt(v) || v < 0) fail(`La capa "${name}" tiene tiles no válidos.`);
    if ((v as number) > MAX_GID) {
      fail(`La capa "${name}" usa tiles girados o de otro tileset: solo se admiten los de Kenney.`);
    }
    return v as number;
  });
}

function objectLayer(layers: unknown[], name: string): Record<string, unknown>[] {
  const layer = layers.find((l) => isObj(l) && l.name === name);
  if (!layer) return [];
  if (!isObj(layer) || layer.type !== 'objectgroup' || !Array.isArray(layer.objects)) {
    return fail(`"${name}" debe ser una capa de objetos.`);
  }
  return layer.objects.map((o) => (isObj(o) ? o : fail(`La capa "${name}" tiene objetos raros.`)));
}

function readRect(o: Record<string, unknown>, layer: string, w: number, h: number): MapRect {
  if (!isInt(o.id) || o.id < 1) fail(`Un objeto de la capa "${layer}" no tiene id.`);
  const n = (k: string) =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : NaN;
  const [px, py, pw, ph] = [n('x'), n('y'), n('width'), n('height')];
  if (o.point || !(pw > 0) || !(ph > 0) || Number.isNaN(px) || Number.isNaN(py)) {
    fail(`"${String(o.name ?? '')}" (capa "${layer}") debe ser un rectángulo.`);
  }
  const x = Math.round(px / TILE_SIZE_PX);
  const y = Math.round(py / TILE_SIZE_PX);
  const rect = {
    id: o.id as number,
    name: '',
    x,
    y,
    width: Math.max(1, Math.round((px + pw) / TILE_SIZE_PX) - x),
    height: Math.max(1, Math.round((py + ph) / TILE_SIZE_PX) - y),
  };
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > w || rect.y + rect.height > h) {
    fail(`"${String(o.name ?? '')}" (capa "${layer}") se sale del mapa.`);
  }
  return rect;
}

/**
 * Lee un Tiled JSON (de la base de datos o importado). Solo admite lo que el juego sabe usar: los
 * tilesets de Kenney incrustados, tiles de 16 px, las capas conocidas y como mucho 100×100 casillas.
 */
export function parseTiledForEditing(raw: unknown): ParseResult {
  try {
    if (!isObj(raw) || !Array.isArray(raw.layers)) fail('No es un mapa de Tiled en formato JSON.');
    const t = raw as Record<string, unknown>;
    if (t.infinite) fail('Los mapas infinitos no se admiten: desactiva «Infinito» en Tiled.');
    if (t.orientation !== undefined && t.orientation !== 'orthogonal') {
      fail('El mapa debe ser ortogonal.');
    }
    if (t.tilewidth !== TILE_SIZE_PX || t.tileheight !== TILE_SIZE_PX) {
      fail(`Los tiles deben ser de ${TILE_SIZE_PX}×${TILE_SIZE_PX} px.`);
    }
    const { width, height } = t;
    if (!isInt(width) || !isInt(height)) fail('Falta el tamaño del mapa.');
    const w = width as number;
    const h = height as number;
    if (w < MAP_MIN_SIZE || h < MAP_MIN_SIZE || w > MAP_MAX_SIZE || h > MAP_MAX_SIZE) {
      fail(`El mapa debe medir entre ${MAP_MIN_SIZE} y ${MAP_MAX_SIZE} casillas de lado.`);
    }

    // Tilesets: los dos de Kenney, incrustados y con su firstgid.
    const tilesets = Array.isArray(t.tilesets) ? t.tilesets : [];
    if (tilesets.some((ts) => isObj(ts) && 'source' in ts)) {
      fail('Los tilesets deben ir incrustados en el mapa («Incrustar tileset» en Tiled).');
    }
    for (const ts of tilesets) {
      const known = TILESETS.find((k) => isObj(ts) && k.name === ts.name);
      if (!known)
        fail(`Tileset desconocido: solo se admiten ${TILESETS.map((k) => k.name).join(' y ')}.`);
      if ((ts as Record<string, unknown>).firstgid !== known!.firstgid) {
        fail(`El tileset ${known!.name} debe empezar en el gid ${known!.firstgid}.`);
      }
    }

    const layersRaw = t.layers as unknown[];
    const size = w * h;
    const layers = {} as Record<TileLayer, number[]>;
    for (const name of TILE_LAYERS) {
      layers[name] = readTileLayer(layersRaw, name, size, name === 'floor' || name === 'walls');
    }
    const collision = readTileLayer(layersRaw, 'collision', size, true).map((v) => (v ? 1 : 0));
    for (const name of TILE_LAYERS) {
      if (layers[name].some((gid) => gid > MAX_GID)) fail(`Tiles no válidos en "${name}".`);
    }

    const spawnObj = objectLayer(layersRaw, 'spawn').find((o) => o.name === 'spawn');
    if (!spawnObj || typeof spawnObj.x !== 'number' || typeof spawnObj.y !== 'number') {
      fail('Falta el punto "spawn" (capa de objetos "spawn").');
    }
    const spawn = {
      x: Math.floor((spawnObj!.x as number) / TILE_SIZE_PX),
      y: Math.floor((spawnObj!.y as number) / TILE_SIZE_PX),
    };

    const rects = (layer: keyof typeof MAX_RECTS, fallback: string) => {
      const objects = objectLayer(layersRaw, layer);
      if (objects.length > MAX_RECTS[layer]) fail(`Demasiados objetos en la capa "${layer}".`);
      return objects.map((o) => ({
        ...readRect(o, layer, w, h),
        name: cleanName(o.name, fallback),
      }));
    };
    const zones = rects('zones', 'Zona privada');
    const whiteboards = rects('whiteboards', 'Pizarra');
    const objectRects = rects('objects', '');
    const objects = objectLayer(layersRaw, 'objects').map((o, i): MapObjectRect => {
      const kind = o.type || o.class;
      const rect = {
        ...objectRects[i]!,
        name: cleanName(o.name, KIND_NAMES[kind as MapObjectKind] ?? 'Objeto'),
      };
      if (!isObjectKind(kind)) fail(`"${rect.name}" tiene un tipo desconocido (${String(kind)}).`);
      const props = Array.isArray(o.properties) ? o.properties : [];
      const prop = props.find((p) => isObj(p) && p.name === 'value') as
        Record<string, unknown> | undefined;
      const parsed = parseObjectValue(kind as MapObjectKind, prop?.value ?? '');
      const value =
        kind === 'game' ? '' : parsed.ok ? parsed.value : fail(`"${rect.name}": ${parsed.error}`);
      return { ...rect, kind: kind as MapObjectKind, value: value as string };
    });

    // El 1 es el punto de inicio. Los ids de Tiled son únicos en todo el mapa.
    const ids = [1, ...[...zones, ...whiteboards, ...objects].map((r) => r.id)];
    if (new Set(ids).size !== ids.length) fail('Hay objetos con el mismo id.');
    const maxId = Math.max(...ids);
    const nextObjectId = isInt(t.nextobjectid)
      ? Math.max(t.nextobjectid as number, maxId + 1)
      : maxId + 1;

    const map: EditableMap = {
      width: w,
      height: h,
      layers,
      collision,
      spawn,
      zones,
      whiteboards,
      objects,
      nextObjectId,
    };
    const error = checkPlayable(map);
    return error ? { ok: false, error } : { ok: true, map };
  } catch (err) {
    if (err instanceof MapError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Lo que el juego exige para poder usar el mapa (por ejemplo, que el inicio se pueda pisar). */
export function checkPlayable(map: EditableMap): string | null {
  const { spawn, width, height } = map;
  if (spawn.x < 0 || spawn.y < 0 || spawn.x >= width || spawn.y >= height) {
    return 'El punto de inicio está fuera del mapa.';
  }
  if (map.collision[spawn.y * width + spawn.x])
    return 'El punto de inicio está sobre una casilla bloqueada.';
  try {
    parseWorldMap(toTiled(map));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'El mapa no es válido.';
  }
}

// --- Escribir Tiled JSON ---

/** Ruta de las imágenes en la plantilla (relativa a packages/shared/src/maps/). */
const TILESET_IMAGE_DIR = '../../../../apps/web/public/assets/tilesets/';

export function toTiled(m: EditableMap, imageDir = TILESET_IMAGE_DIR): TiledMap {
  const T = TILE_SIZE_PX;
  const tileLayer = (id: number, name: string, data: number[], extra = {}) => ({
    id,
    name,
    type: 'tilelayer' as const,
    x: 0,
    y: 0,
    width: m.width,
    height: m.height,
    opacity: 1,
    visible: true,
    data,
    ...extra,
  });
  const rectObject = (r: MapRect, type: string, value?: string) => ({
    id: r.id,
    name: r.name,
    type,
    x: r.x * T,
    y: r.y * T,
    width: r.width * T,
    height: r.height * T,
    rotation: 0,
    visible: true,
    ...(value ? { properties: [{ name: 'value', type: 'string', value }] } : {}),
  });
  const objectLayer = (id: number, name: string, objects: object[], extra = {}) => ({
    id,
    name,
    type: 'objectgroup' as const,
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
    width: m.width,
    height: m.height,
    tilewidth: T,
    tileheight: T,
    nextlayerid: 10,
    nextobjectid: m.nextObjectId,
    layers: [
      tileLayer(1, 'floor', [...m.layers.floor]),
      tileLayer(2, 'walls', [...m.layers.walls]),
      tileLayer(3, 'decor-below', [...m.layers['decor-below']]),
      tileLayer(4, 'furniture', [...m.layers.furniture]),
      // Colisión: cualquier tile distinto de 0 bloquea. Oculta en el juego.
      tileLayer(
        5,
        'collision',
        m.collision.map((v) => (v ? baseGid(1) : 0)),
        { visible: false, opacity: 0.5 },
      ),
      objectLayer(6, 'spawn', [
        {
          id: 1,
          name: 'spawn',
          type: '',
          point: true,
          x: m.spawn.x * T + T / 2,
          y: m.spawn.y * T + T / 2,
          width: 0,
          height: 0,
          rotation: 0,
          visible: true,
        },
      ]),
      objectLayer(
        7,
        'zones',
        m.zones.map((z) => rectObject(z, 'private')),
        {
          opacity: 0.4,
          visible: false,
        },
      ),
      objectLayer(
        8,
        'whiteboards',
        m.whiteboards.map((b) => rectObject(b, 'whiteboard')),
      ),
      objectLayer(
        9,
        'objects',
        m.objects.map((o) => rectObject(o, o.kind, o.value)),
      ),
    ],
    tilesets: TILESETS.map((ts) => ({
      firstgid: ts.firstgid,
      name: ts.name,
      image: `${imageDir}${ts.name}.png`,
      imagewidth: ts.imagewidth,
      imageheight: ts.imageheight,
      tilewidth: T,
      tileheight: T,
      spacing: 1,
      margin: 0,
      columns: ts.columns,
      tilecount: ts.columns * ts.rows,
    })),
  };
  return map as unknown as TiledMap;
}

// --- Paredes ---

const STYLE_TOPS = WALL_STYLES.map(
  (s) => new Set(Object.values(WALL_TOP).map((id) => baseGid(id + s.offset))),
);
const STYLE_FACES = WALL_STYLES.map(
  (s) => new Set(Object.values(WALL_FACE).map((id) => baseGid(id + s.offset))),
);

/** Estilo de pared (1, 2…) de cada casilla según la capa de paredes; 0 si no es pared. */
export function wallGridOf(m: EditableMap): Uint8Array {
  return Uint8Array.from(m.layers.walls, (gid) => {
    const style = STYLE_TOPS.findIndex((tops) => tops.has(gid));
    return style + 1;
  });
}

const isGenerated = (gid: number) =>
  gid !== 0 &&
  (STYLE_TOPS.some((tops) => tops.has(gid)) || STYLE_FACES.some((faces) => faces.has(gid)));

/**
 * Vuelve a dibujar la capa de paredes a partir de `grid` (estilo de cada casilla, 0 = sin pared):
 * la parte de arriba según sus vecinas y, debajo de cada pared horizontal, dos filas de cara. Los
 * tiles de la capa que no son paredes ni caras (puestos a mano en Tiled) se respetan. Devuelve las
 * casillas que han cambiado (para recalcular su colisión).
 */
export function rebuildWalls(m: EditableMap, grid: Uint8Array): number[] {
  const { width: W, height: H } = m;
  const idx = (x: number, y: number) => y * W + x;
  const isWall = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && grid[idx(x, y)]! > 0;

  const faces = new Map<number, { level: 'upper' | 'lower'; style: number }>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isWall(x, y) || isWall(x, y + 1)) continue;
      const style = grid[idx(x, y)]!;
      for (const [dy, level] of [
        [1, 'upper'],
        [2, 'lower'],
      ] as const) {
        const fy = y + dy;
        if (fy >= H || isWall(x, fy)) break;
        faces.set(idx(x, fy), { level, style });
      }
    }

  const topTile = (x: number, y: number) => {
    const u = isWall(x, y - 1);
    const d = isWall(x, y + 1);
    const l = isWall(x - 1, y);
    const r = isWall(x + 1, y);
    if (u && d) return WALL_TOP.v;
    if (l && r) return WALL_TOP.h;
    if (r && d) return WALL_TOP.topLeft;
    if (l && d) return WALL_TOP.topRight;
    if (u && r) return WALL_TOP.upRight;
    if (u && l) return WALL_TOP.upLeft;
    if (r) return WALL_TOP.endRight;
    if (l) return WALL_TOP.endLeft;
    return WALL_TOP.v;
  };

  const walls = m.layers.walls;
  const changed: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const before = walls[i];
      const style = grid[i]!;
      if (style > 0) {
        walls[i] = baseGid(topTile(x, y) + WALL_STYLES[style - 1]!.offset);
        if (walls[i] !== before) changed.push(i);
        continue;
      }
      const face = faces.get(i);
      if (face && (walls[i] === 0 || isGenerated(walls[i]!))) {
        const same = (fx: number) => faces.get(idx(fx, y))?.level === face.level || isWall(fx, y);
        let id: number = face.level === 'upper' ? WALL_FACE.upper : WALL_FACE.lower;
        if (!same(x - 1)) id = face.level === 'upper' ? WALL_FACE.upperL : WALL_FACE.lowerL;
        else if (!same(x + 1)) id = face.level === 'upper' ? WALL_FACE.upperR : WALL_FACE.lowerR;
        walls[i] = baseGid(id + WALL_STYLES[face.style - 1]!.offset);
      } else if (isGenerated(walls[i]!)) {
        walls[i] = 0;
      }
      if (walls[i] !== before) changed.push(i);
    }
  return changed;
}

// --- Colisión ---

/**
 * Si la casilla bloquea según lo que hay pintado: paredes y caras siempre; muebles de la paleta según
 * su tipo; un mueble que no está en la paleta (importado) conserva lo que tuviera.
 */
export function blocksAt(m: EditableMap, i: number): 0 | 1 {
  if (m.layers.walls[i]) return 1;
  const f = m.layers.furniture[i]!;
  if (f && BLOCKING_GIDS.has(f)) return 1;
  if (f && !WALKABLE_GIDS.has(f)) return m.collision[i] ? 1 : 0;
  return 0;
}

/** Recalcula la colisión de las casillas indicadas (las que se acaban de pintar). */
export function recomputeCollision(m: EditableMap, cells: Iterable<number>): void {
  for (const i of cells) m.collision[i] = blocksAt(m, i);
}

// --- Mapas nuevos y tamaño ---

const FLOOR_DEFAULT = baseGid(120);

/** Sala vacía: suelo de piedra, paredes alrededor y el inicio en el centro. */
export function emptyMap(width: number, height: number): EditableMap {
  const size = width * height;
  const m: EditableMap = {
    width,
    height,
    layers: {
      floor: new Array<number>(size).fill(FLOOR_DEFAULT),
      walls: new Array<number>(size).fill(0),
      'decor-below': new Array<number>(size).fill(0),
      furniture: new Array<number>(size).fill(0),
    },
    collision: new Array<number>(size).fill(0),
    spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    zones: [],
    whiteboards: [],
    objects: [],
    nextObjectId: 2,
  };
  const grid = new Uint8Array(size);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) grid[y * width + x] = 1;
  rebuildWalls(m, grid);
  recomputeCollision(m, m.collision.keys());
  return m;
}

/**
 * Cambia el tamaño (crece o recorta por la derecha y por abajo). Lo nuevo es suelo; los rectángulos
 * que se salen se quitan y el inicio se queda dentro.
 */
export function resizeMap(m: EditableMap, width: number, height: number): EditableMap {
  const copy = (data: number[], fill: number) => {
    const out = new Array<number>(width * height).fill(fill);
    for (let y = 0; y < Math.min(height, m.height); y++)
      for (let x = 0; x < Math.min(width, m.width); x++)
        out[y * width + x] = data[y * m.width + x]!;
    return out;
  };
  const inside = (r: MapRect) => r.x + r.width <= width && r.y + r.height <= height;
  const resized: EditableMap = {
    ...m,
    width,
    height,
    layers: {
      floor: copy(m.layers.floor, FLOOR_DEFAULT),
      walls: copy(m.layers.walls, 0),
      'decor-below': copy(m.layers['decor-below'], 0),
      furniture: copy(m.layers.furniture, 0),
    },
    collision: copy(m.collision, 0),
    spawn: { x: Math.min(m.spawn.x, width - 1), y: Math.min(m.spawn.y, height - 1) },
    zones: m.zones.filter(inside),
    whiteboards: m.whiteboards.filter(inside),
    objects: m.objects.filter(inside),
  };
  // Las caras de pared del borde recortado se vuelven a calcular.
  const grid = new Uint8Array(width * height);
  const old = wallGridOf(m);
  for (let y = 0; y < Math.min(height, m.height); y++)
    for (let x = 0; x < Math.min(width, m.width); x++) grid[y * width + x] = old[y * m.width + x]!;
  recomputeCollision(resized, rebuildWalls(resized, grid));
  return resized;
}

/** Copia profunda (para deshacer y rehacer en el editor). */
export function cloneMap(m: EditableMap): EditableMap {
  return {
    ...m,
    layers: {
      floor: [...m.layers.floor],
      walls: [...m.layers.walls],
      'decor-below': [...m.layers['decor-below']],
      furniture: [...m.layers.furniture],
    },
    collision: [...m.collision],
    spawn: { ...m.spawn },
    zones: m.zones.map((z) => ({ ...z })),
    whiteboards: m.whiteboards.map((b) => ({ ...b })),
    objects: m.objects.map((o) => ({ ...o })),
  };
}
