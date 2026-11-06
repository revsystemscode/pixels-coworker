import { describe, expect, it } from 'vitest';
import { applyStep, isWalkable, parseWorldMap } from './map.js';
import { MAPS } from './maps/index.js';
import { findPath } from './pathfinding.js';
import { tiledFromAscii } from './testing.js';

const small = parseWorldMap(
  tiledFromAscii([
    '#####', //
    '#S..#',
    '#.#.#',
    '#...#',
    '#####',
  ]),
);

describe('parseWorldMap', () => {
  it('lee colisiones y spawn', () => {
    expect(small.width).toBe(5);
    expect(small.spawn).toEqual({ x: 1, y: 1 });
    expect(isWalkable(small, 1, 1)).toBe(true);
    expect(isWalkable(small, 2, 2)).toBe(false);
    expect(isWalkable(small, 0, 0)).toBe(false);
  });

  it('trata como bloqueado todo lo que está fuera del mapa o no es entero', () => {
    expect(isWalkable(small, -1, 1)).toBe(false);
    expect(isWalkable(small, 5, 1)).toBe(false);
    expect(isWalkable(small, 1.5, 1)).toBe(false);
  });

  it('falla si falta la capa de colisión', () => {
    expect(() =>
      parseWorldMap({ width: 1, height: 1, tilewidth: 16, tileheight: 16, layers: [] }),
    ).toThrow(/collision/);
  });

  it('falla si el spawn está bloqueado', () => {
    const map = tiledFromAscii(['S#']);
    map.layers[1] = {
      type: 'objectgroup',
      name: 'spawn',
      objects: [{ name: 'spawn', x: 24, y: 8 }],
    };
    expect(() => parseWorldMap(map)).toThrow(/bloqueado/);
  });
});

describe('applyStep', () => {
  it('avanza a una casilla libre', () => {
    expect(applyStep(small, { x: 1, y: 1 }, 'right')).toEqual({ x: 2, y: 1 });
  });

  it('no atraviesa paredes', () => {
    expect(applyStep(small, { x: 1, y: 1 }, 'up')).toBeNull();
    expect(applyStep(small, { x: 2, y: 1 }, 'down')).toBeNull();
  });
});

describe('findPath', () => {
  it('rodea los obstáculos por el camino más corto', () => {
    const path = findPath(small, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(path).toHaveLength(4);
    let pos: { x: number; y: number } | null = { x: 1, y: 1 };
    for (const dir of path!) pos = pos && applyStep(small, pos, dir);
    expect(pos).toEqual({ x: 3, y: 3 });
  });

  it('devuelve [] si ya estás en el destino y null si no se puede llegar', () => {
    expect(findPath(small, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(findPath(small, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });
});

describe('mapa de la oficina', () => {
  const office = parseWorldMap(MAPS.office);

  it('se puede cargar y el spawn es pisable', () => {
    expect(office.tileSize).toBe(16);
    expect(isWalkable(office, office.spawn.x, office.spawn.y)).toBe(true);
  });

  it('todas las salas son alcanzables desde el spawn', () => {
    // Un punto dentro de cada sala: reuniones, cocina, concentración y las esquinas de la oficina.
    for (const target of [
      { x: 2, y: 5 },
      { x: 20, y: 5 },
      { x: 33, y: 5 },
      { x: 2, y: 23 },
      { x: 37, y: 23 },
    ]) {
      expect(
        findPath(office, office.spawn, target),
        `sin camino a ${target.x},${target.y}`,
      ).not.toBeNull();
    }
  });
});
