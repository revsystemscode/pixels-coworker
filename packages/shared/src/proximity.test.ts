import { describe, expect, it } from 'vitest';
import { HEARING_RADIUS, MIN_HEARING_VOLUME } from './constants.js';
import { parseWorldMap, zoneAt } from './map.js';
import { MAPS } from './maps/index.js';
import { audiblePeers, hearingVolume } from './proximity.js';
import { tiledFromAscii } from './testing.js';

// 12×6 libre, con una sala privada en x 0–3, y 0–2 y otra en x 8–11, y 0–2.
const map = parseWorldMap(
  tiledFromAscii(
    [
      '............',
      '............',
      '............',
      '.....S......',
      '............',
      '............',
    ],
    16,
    [
      { name: 'Sala A', x: 0, y: 0, width: 4, height: 3 },
      { name: 'Sala B', x: 8, y: 0, width: 4, height: 3 },
    ],
  ),
);

describe('zonas privadas', () => {
  it('lee los rectángulos de la capa "zones" en tiles', () => {
    expect(map.zones).toEqual([
      { id: 'zone-1', name: 'Sala A', x: 0, y: 0, width: 4, height: 3 },
      { id: 'zone-2', name: 'Sala B', x: 8, y: 0, width: 4, height: 3 },
    ]);
  });

  it('zoneAt incluye los bordes de dentro y excluye los de fuera', () => {
    expect(zoneAt(map, { x: 0, y: 0 })?.name).toBe('Sala A');
    expect(zoneAt(map, { x: 3, y: 2 })?.name).toBe('Sala A');
    expect(zoneAt(map, { x: 4, y: 2 })).toBeNull();
    expect(zoneAt(map, { x: 3, y: 3 })).toBeNull();
  });

  it('un mapa sin capa de zonas no tiene zonas', () => {
    expect(parseWorldMap(tiledFromAscii(['S.'])).zones).toEqual([]);
  });

  it('rechaza puntos en la capa de zonas', () => {
    const tiled = tiledFromAscii(['S.']);
    tiled.layers.push({
      type: 'objectgroup',
      name: 'zones',
      objects: [{ name: 'x', x: 0, y: 0, point: true }],
    });
    expect(() => parseWorldMap(tiled)).toThrow(/rectángulo/);
  });

  it('la oficina tiene la sala de reuniones y la de concentración, y el spawn queda fuera', () => {
    const office = parseWorldMap(MAPS.office);
    expect(office.zones.map((z) => z.name)).toEqual(['Sala de reuniones', 'Sala de concentración']);
    expect(zoneAt(office, office.spawn)).toBeNull();
    expect(zoneAt(office, { x: 6, y: 7 })?.name).toBe('Sala de reuniones');
    // La puerta (fila 8) ya es espacio abierto.
    expect(zoneAt(office, { x: 6, y: 8 })).toBeNull();
  });
});

describe('hearingVolume', () => {
  it('en el espacio abierto, volumen 1 cerca y bajando hasta el borde del radio', () => {
    expect(hearingVolume(map, { x: 5, y: 4 }, { x: 5, y: 4 })).toBe(1);
    expect(hearingVolume(map, { x: 5, y: 4 }, { x: 6, y: 4 })).toBe(1);
    const mid = hearingVolume(map, { x: 5, y: 4 }, { x: 7, y: 4 });
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(MIN_HEARING_VOLUME);
    expect(hearingVolume(map, { x: 5, y: 4 }, { x: 5 + HEARING_RADIUS, y: 4 })).toBeCloseTo(
      MIN_HEARING_VOLUME,
    );
  });

  it('nadie oye a quien está fuera del radio', () => {
    // (3, 1) está a √10 ≈ 3,16 tiles.
    expect(hearingVolume(map, { x: 5, y: 4 }, { x: 8, y: 5 })).toBe(0);
    expect(hearingVolume(map, { x: 5, y: 4 }, { x: 9, y: 4 })).toBe(0);
  });

  it('dentro de una zona se oye a todos los de la zona, aunque estén lejos', () => {
    expect(hearingVolume(map, { x: 0, y: 0 }, { x: 3, y: 2 })).toBe(1);
  });

  it('no se oye entre dentro y fuera de una zona, aunque estén pegados', () => {
    expect(hearingVolume(map, { x: 3, y: 2 }, { x: 4, y: 2 })).toBe(0);
    expect(hearingVolume(map, { x: 4, y: 2 }, { x: 3, y: 2 })).toBe(0);
  });

  it('no se oye entre dos zonas distintas', () => {
    expect(hearingVolume(map, { x: 3, y: 0 }, { x: 8, y: 0 }, 10)).toBe(0);
  });

  it('es simétrico', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 3 },
      { x: 5, y: 4 },
      { x: 7, y: 5 },
      { x: 9, y: 1 },
    ];
    for (const a of points)
      for (const b of points) expect(hearingVolume(map, a, b)).toBe(hearingVolume(map, b, a));
  });
});

describe('audiblePeers', () => {
  it('devuelve solo a quien se oye, con su volumen', () => {
    const peers = audiblePeers(map, { x: 5, y: 4 }, [
      ['cerca', { x: 6, y: 4 }],
      ['lejos', { x: 11, y: 5 }],
      ['en-sala', { x: 2, y: 1 }],
    ]);
    expect([...peers]).toEqual([['cerca', 1]]);
  });
});
