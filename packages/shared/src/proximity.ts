import { HEARING_RADIUS, MIN_HEARING_VOLUME } from './constants.js';
import { zoneAt, type WorldMap } from './map.js';
import type { Point } from './tiles.js';

/**
 * Volumen (0–1) con el que `a` oye a `b`. 0 = no se oyen (y tampoco se ven).
 * - Si alguno está en una zona privada, se oyen a volumen 1 solo si están en la misma zona.
 * - En el espacio abierto: volumen 1 hasta 1 tile, baja hasta MIN_HEARING_VOLUME en el borde del
 *   radio y es 0 más allá.
 * Es simétrico: si a oye a b, b oye a a con el mismo volumen.
 */
export function hearingVolume(map: WorldMap, a: Point, b: Point, radius = HEARING_RADIUS): number {
  const za = zoneAt(map, a);
  const zb = zoneAt(map, b);
  if (za || zb) return za?.id === zb?.id ? 1 : 0;

  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d > radius) return 0;
  if (d <= 1 || radius <= 1) return 1;
  return 1 - ((1 - MIN_HEARING_VOLUME) * (d - 1)) / (radius - 1);
}

/** Personas que `self` oye, con su volumen. Las que no se oyen no aparecen. */
export function audiblePeers(
  map: WorldMap,
  self: Point,
  peers: Iterable<readonly [string, Point]>,
  radius = HEARING_RADIUS,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [id, pos] of peers) {
    const volume = hearingVolume(map, self, pos, radius);
    if (volume > 0) result.set(id, volume);
  }
  return result;
}
