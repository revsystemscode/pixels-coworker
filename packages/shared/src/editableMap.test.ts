import { describe, expect, it } from 'vitest';
import {
  checkPlayable,
  emptyMap,
  parseTiledForEditing,
  rebuildWalls,
  recomputeCollision,
  resizeMap,
  toTiled,
  wallGridOf,
  type EditableMap,
} from './editableMap.js';
import { parseWorldMap } from './map.js';
import { MAPS } from './maps/index.js';
import { BLOCKING_GIDS, PALETTE, baseGid, indoorGid, tileSource } from './palette.js';

const office = () => {
  const parsed = parseTiledForEditing(structuredClone(MAPS.office));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.map;
};

describe('leer y escribir mapas', () => {
  it('la oficina sale idéntica tras leerla y escribirla', () => {
    expect(toTiled(office())).toEqual(MAPS.office);
  });

  it('las paredes automáticas y la colisión reproducen la oficina', () => {
    const m = office();
    const walls = [...m.layers.walls];
    const collision = [...m.collision];
    m.layers.walls.fill(0);
    rebuildWalls(m, wallGridOf({ ...m, layers: { ...m.layers, walls } }));
    expect(m.layers.walls).toEqual(walls);
    recomputeCollision(m, m.collision.keys());
    expect(m.collision).toEqual(collision);
  });

  it('rechaza mapas que el juego no sabe usar, con un motivo claro', () => {
    const bad = (change: (m: Record<string, unknown>) => void) => {
      const raw = structuredClone(MAPS.office) as unknown as Record<string, unknown>;
      change(raw);
      const result = parseTiledForEditing(raw);
      return result.ok ? null : result.error;
    };
    expect(bad((m) => (m.width = 500))).toMatch(/entre 8 y 100/);
    expect(bad((m) => (m.infinite = true))).toMatch(/infinitos/);
    expect(bad((m) => (m.tilewidth = 32))).toMatch(/16×16/);
    expect(bad((m) => ((m.tilesets as object[])[0] = { firstgid: 1, source: 'x.tsx' }))).toMatch(
      /incrustados/,
    );
    expect(bad((m) => ((m.tilesets as { name: string }[])[1]!.name = 'otro'))).toMatch(
      /desconocido/,
    );
    const layer = (m: Record<string, unknown>, name: string) =>
      (m.layers as { name: string; data?: unknown; objects?: Record<string, unknown>[] }[]).find(
        (l) => l.name === name,
      )!;
    expect(bad((m) => (layer(m, 'floor').data = 'eJzt...'))).toMatch(/comprimida/);
    expect(bad((m) => ((layer(m, 'floor').data as number[])[0] = 99999))).toMatch(/girados/);
    expect(
      bad((m) => (m.layers = (m.layers as { name: string }[]).filter((l) => l.name !== 'spawn'))),
    ).toMatch(/spawn/);
    expect(bad((m) => (layer(m, 'objects').objects![0]!.x = 16 * 200))).toMatch(/se sale/);
    expect(bad((m) => (layer(m, 'objects').objects![0]!.type = 'tv'))).toMatch(/desconocido/);
    expect(
      bad((m) => (layer(m, 'objects').objects![0]!.id = layer(m, 'whiteboards').objects![0]!.id)),
    ).toMatch(/mismo id/);
    expect(bad((m) => ((layer(m, 'collision').data as number[])[19 + 16 * 40] = 1))).toMatch(
      /inicio/,
    );
    expect(parseTiledForEditing('hola')).toMatchObject({ ok: false });
  });
});

describe('paredes', () => {
  it('una pared horizontal tiene dos filas de cara debajo, y quitarla las borra', () => {
    const m = emptyMap(10, 10);
    const grid = wallGridOf(m);
    for (let x = 2; x <= 6; x++) grid[4 * 10 + x] = 2; // pared gris
    const changed = rebuildWalls(m, grid);
    recomputeCollision(m, changed);
    const at = (x: number, y: number) => m.layers.walls[y * 10 + x]!;
    expect(at(4, 4)).toBe(baseGid(698 + 7));
    expect(at(4, 5)).toBe(baseGid(873 + 7));
    expect(at(4, 6)).toBe(baseGid(868 + 7));
    expect(at(4, 7)).toBe(0);
    expect(m.collision[6 * 10 + 4]).toBe(1);

    for (let x = 2; x <= 6; x++) grid[4 * 10 + x] = 0;
    recomputeCollision(m, rebuildWalls(m, grid));
    expect([at(4, 4), at(4, 5), at(4, 6)]).toEqual([0, 0, 0]);
    expect(m.collision[5 * 10 + 4]).toBe(0);
  });

  it('respeta los tiles puestos a mano en la capa de paredes', () => {
    const m = emptyMap(10, 10);
    m.layers.walls[5 * 10 + 5] = indoorGid(343);
    rebuildWalls(m, wallGridOf(m));
    expect(m.layers.walls[5 * 10 + 5]).toBe(indoorGid(343));
  });
});

describe('mapas nuevos y tamaño', () => {
  it('un mapa en blanco se puede jugar', () => {
    const m = emptyMap(20, 15);
    expect(checkPlayable(m)).toBeNull();
    const world = parseWorldMap(toTiled(m));
    expect(world.spawn).toEqual({ x: 10, y: 7 });
  });

  it('al recortar se quitan los objetos que se salen y el inicio queda dentro', () => {
    const m = office();
    const small = resizeMap(m, 20, 12);
    expect(small.layers.floor).toHaveLength(240);
    expect(small.spawn.x).toBeLessThan(20);
    expect(small.spawn.y).toBeLessThan(12);
    expect(small.whiteboards.map((b) => b.name)).toEqual([
      'Pizarra de reuniones',
      'Pizarra de la oficina',
    ]);
    // La pantalla de la cocina (x 18–20) ya no cabe en 20 columnas.
    expect(small.objects.map((o) => o.name)).toEqual(['Tablón de anuncios']);
  });
});

describe('paleta', () => {
  it('todas las piezas existen en los tilesets y tienen id único', () => {
    expect(new Set(PALETTE.map((p) => p.id)).size).toBe(PALETTE.length);
    for (const item of PALETTE) {
      for (const gid of item.tiles.flat()) expect(tileSource(gid), item.id).not.toBeNull();
    }
  });

  it('una silla no bloquea; una mesa sí', () => {
    expect(BLOCKING_GIDS.has(indoorGid(55))).toBe(false);
    expect(BLOCKING_GIDS.has(indoorGid(113))).toBe(true);
  });

  it('pintar un mueble que bloquea actualiza la colisión', () => {
    const m: EditableMap = emptyMap(10, 10);
    const i = 3 * 10 + 3;
    m.layers.furniture[i] = indoorGid(115);
    recomputeCollision(m, [i]);
    expect(m.collision[i]).toBe(1);
    m.layers.furniture[i] = 0;
    recomputeCollision(m, [i]);
    expect(m.collision[i]).toBe(0);
  });
});
