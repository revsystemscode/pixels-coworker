import { DIRECTION_DELTA, type Direction } from './direction.js';
import type { Point } from './tiles.js';

/** Subconjunto del formato Tiled JSON que usamos. */
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

export type TiledLayer =
  | { type: 'tilelayer'; name: string; width: number; height: number; data: number[] }
  | { type: 'objectgroup'; name: string; objects: TiledObject[] };

export interface TiledObject {
  id?: number;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
}

/** Zona privada (rectángulo en tiles). Quien está dentro solo oye y ve a los de su misma zona. */
export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Mapa ya procesado, listo para validar movimientos (en coordenadas de tile). */
export interface WorldMap {
  width: number;
  height: number;
  tileSize: number;
  /** 1 = bloqueado, 0 = se puede pisar. Índice: y * width + x. */
  blocked: Uint8Array;
  spawn: Point;
  zones: Zone[];
}

export const COLLISION_LAYER = 'collision';
export const SPAWN_LAYER = 'spawn';
export const ZONES_LAYER = 'zones';

/**
 * Convierte un mapa de Tiled en un WorldMap.
 * - Capa de tiles "collision": cualquier tile distinto de 0 bloquea.
 * - Capa de objetos "spawn": un punto llamado "spawn" marca dónde aparecen los jugadores.
 * - Capa de objetos "zones" (opcional): cada rectángulo es una zona privada. Su nombre se muestra
 *   al entrar. Se redondea a tiles completos.
 */
export function parseWorldMap(map: TiledMap): WorldMap {
  if (map.tilewidth !== map.tileheight) throw new Error('Los tiles deben ser cuadrados');

  const collision = map.layers.find((l) => l.type === 'tilelayer' && l.name === COLLISION_LAYER);
  if (!collision || collision.type !== 'tilelayer') {
    throw new Error(`El mapa necesita una capa de tiles "${COLLISION_LAYER}"`);
  }
  if (collision.data.length !== map.width * map.height) {
    throw new Error('La capa de colisión no coincide con el tamaño del mapa');
  }
  const blocked = Uint8Array.from(collision.data, (gid) => (gid !== 0 ? 1 : 0));

  const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === SPAWN_LAYER);
  const spawnObject =
    spawnLayer?.type === 'objectgroup'
      ? spawnLayer.objects.find((o) => o.name === 'spawn')
      : undefined;
  if (!spawnObject)
    throw new Error(`El mapa necesita un punto "spawn" en la capa "${SPAWN_LAYER}"`);

  const spawn = {
    x: Math.floor(spawnObject.x / map.tilewidth),
    y: Math.floor(spawnObject.y / map.tileheight),
  };
  const world: WorldMap = {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    blocked,
    spawn,
    zones: parseZones(map),
  };
  if (!isWalkable(world, spawn.x, spawn.y))
    throw new Error('El punto "spawn" está sobre un tile bloqueado');
  return world;
}

function parseZones(map: TiledMap): Zone[] {
  const layer = map.layers.find((l) => l.type === 'objectgroup' && l.name === ZONES_LAYER);
  if (layer?.type !== 'objectgroup') return [];
  const T = map.tilewidth;
  return layer.objects.map((o, i) => {
    if (o.point || !o.width || !o.height) {
      throw new Error(`La zona "${o.name}" debe ser un rectángulo`);
    }
    const x = Math.round(o.x / T);
    const y = Math.round(o.y / T);
    return {
      id: `zone-${o.id ?? i}`,
      name: o.name || 'Zona privada',
      x,
      y,
      width: Math.max(1, Math.round((o.x + o.width) / T) - x),
      height: Math.max(1, Math.round((o.y + o.height) / T) - y),
    };
  });
}

/** Zona privada que contiene la casilla, o null si está en el espacio abierto. */
export function zoneAt(map: WorldMap, p: Point): Zone | null {
  return (
    map.zones.find(
      (z) => p.x >= z.x && p.x < z.x + z.width && p.y >= z.y && p.y < z.y + z.height,
    ) ?? null
  );
}

export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.blocked[y * map.width + x] === 0;
}

/** Devuelve la casilla destino si el paso es válido, o null si está bloqueada. */
export function applyStep(map: WorldMap, from: Point, dir: Direction): Point | null {
  const d = DIRECTION_DELTA[dir];
  const to = { x: from.x + d.x, y: from.y + d.y };
  return isWalkable(map, to.x, to.y) ? to : null;
}
