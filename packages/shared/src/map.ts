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
  name: string;
  x: number;
  y: number;
  point?: boolean;
}

/** Mapa ya procesado, listo para validar movimientos (en coordenadas de tile). */
export interface WorldMap {
  width: number;
  height: number;
  tileSize: number;
  /** 1 = bloqueado, 0 = se puede pisar. Índice: y * width + x. */
  blocked: Uint8Array;
  spawn: Point;
}

export const COLLISION_LAYER = 'collision';
export const SPAWN_LAYER = 'spawn';

/**
 * Convierte un mapa de Tiled en un WorldMap.
 * - Capa de tiles "collision": cualquier tile distinto de 0 bloquea.
 * - Capa de objetos "spawn": un punto llamado "spawn" marca dónde aparecen los jugadores.
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
  };
  if (!isWalkable(world, spawn.x, spawn.y))
    throw new Error('El punto "spawn" está sobre un tile bloqueado');
  return world;
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
