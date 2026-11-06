import { TILE_SIZE } from './constants.js';

export interface Point {
  x: number;
  y: number;
}

/** Convierte coordenadas de tile a píxeles (centro del tile). */
export function tileToPixel(tile: Point, tileSize = TILE_SIZE): Point {
  return { x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 };
}

/** Convierte coordenadas en píxeles al tile que las contiene. */
export function pixelToTile(pixel: Point, tileSize = TILE_SIZE): Point {
  return { x: Math.floor(pixel.x / tileSize), y: Math.floor(pixel.y / tileSize) };
}

/** Distancia en tiles entre dos puntos en píxeles (base para la proximidad de la Fase 2). */
export function tileDistance(a: Point, b: Point, tileSize = TILE_SIZE): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / tileSize;
}
