import { DIRECTIONS, DIRECTION_DELTA, type Direction } from './direction.js';
import { isWalkable, type WorldMap } from './map.js';
import type { Point } from './tiles.js';

/**
 * Camino más corto entre dos casillas (búsqueda en anchura sobre la cuadrícula de 4 direcciones).
 * Devuelve la lista de pasos, [] si ya estás en el destino, o null si no se puede llegar.
 */
export function findPath(map: WorldMap, from: Point, to: Point): Direction[] | null {
  if (!isWalkable(map, to.x, to.y)) return null;
  return findPathWhere(map, from, (x, y) => x === to.x && y === to.y);
}

/**
 * Camino más corto hasta la casilla libre más cercana que cumpla `isGoal` (por ejemplo, «junto a
 * una pizarra»). [] si ya se cumple donde estás; null si no se puede llegar a ninguna.
 */
export function findPathWhere(
  map: WorldMap,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
): Direction[] | null {
  if (!isWalkable(map, from.x, from.y)) return null;

  const { width } = map;
  const start = from.y * width + from.x;
  // cameFrom[i] = índice de la casilla anterior; -1 = no visitada.
  const cameFrom = new Int32Array(map.width * map.height).fill(-1);
  const viaDir = new Uint8Array(map.width * map.height);
  cameFrom[start] = start;

  let goal = -1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const cx = current % width;
    const cy = (current - cx) / width;
    if (isGoal(cx, cy)) {
      goal = current;
      break;
    }
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

  if (goal === -1) return null;
  const steps: Direction[] = [];
  for (let i = goal; i !== start; i = cameFrom[i]!) steps.push(DIRECTIONS[viaDir[i]!]!);
  return steps.reverse();
}
