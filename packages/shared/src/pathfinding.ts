import { DIRECTIONS, DIRECTION_DELTA, type Direction } from './direction.js';
import { isWalkable, type WorldMap } from './map.js';
import type { Point } from './tiles.js';

/**
 * Camino más corto entre dos casillas (búsqueda en anchura sobre la cuadrícula de 4 direcciones).
 * Devuelve la lista de pasos, [] si ya estás en el destino, o null si no se puede llegar.
 */
export function findPath(map: WorldMap, from: Point, to: Point): Direction[] | null {
  if (!isWalkable(map, to.x, to.y) || !isWalkable(map, from.x, from.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];

  const { width } = map;
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  // cameFrom[i] = índice de la casilla anterior; -1 = no visitada.
  const cameFrom = new Int32Array(map.width * map.height).fill(-1);
  const viaDir = new Uint8Array(map.width * map.height);
  cameFrom[start] = start;

  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    if (current === goal) break;
    const cx = current % width;
    const cy = (current - cx) / width;
    DIRECTIONS.forEach((dir, dirIndex) => {
      const nx = cx + DIRECTION_DELTA[dir].x;
      const ny = cy + DIRECTION_DELTA[dir].y;
      if (!isWalkable(map, nx, ny)) return;
      const next = ny * width + nx;
      if (cameFrom[next] !== -1) return;
      cameFrom[next] = current;
      viaDir[next] = dirIndex;
      queue.push(next);
    });
  }

  if (cameFrom[goal] === -1) return null;
  const steps: Direction[] = [];
  for (let i = goal; i !== start; i = cameFrom[i]!) steps.push(DIRECTIONS[viaDir[i]!]!);
  return steps.reverse();
}
