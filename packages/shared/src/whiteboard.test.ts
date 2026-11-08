import { describe, expect, it } from 'vitest';
import { WHITEBOARD_MAX_ELEMENT_BYTES, WHITEBOARD_REACH } from './constants.js';
import { distanceToRect, parseWorldMap, whiteboardAt, whiteboardNear } from './map.js';
import { MAPS } from './maps/index.js';
import { findPathWhere } from './pathfinding.js';
import { tiledFromAscii } from './testing.js';
import {
  chunkElements,
  isNewerElement,
  jsonSize,
  parseBoardOpen,
  parseBoardPointer,
  parseBoardUpdate,
  sanitizeBoardElement,
  type BoardElement,
} from './whiteboard.js';

const element = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'abc123',
  type: 'rectangle',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  angle: 0,
  version: 3,
  versionNonce: 1000,
  isDeleted: false,
  strokeColor: '#1e1e1e',
  groupIds: [],
  boundElements: null,
  link: null,
  ...over,
});

const map = parseWorldMap(
  tiledFromAscii(
    [
      '##########', //
      '#S.......#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
    16,
    [],
    [{ name: 'Pizarra', x: 3, y: 0, width: 3, height: 1 }],
  ),
);

describe('pizarras en el mapa', () => {
  it('lee la capa "whiteboards" con un id estable', () => {
    expect(map.whiteboards).toEqual([
      { id: 'board-1', name: 'Pizarra', x: 3, y: 0, width: 3, height: 1 },
    ]);
  });

  it('la oficina trae dos pizarras', () => {
    const office = parseWorldMap(MAPS.office);
    expect(office.whiteboards.map((b) => b.name)).toEqual([
      'Pizarra de reuniones',
      'Pizarra de la oficina',
    ]);
    // Desde cada pizarra se llega caminando.
    for (const board of office.whiteboards) {
      const path = findPathWhere(
        office,
        office.spawn,
        (x, y) => distanceToRect({ x, y }, board) <= WHITEBOARD_REACH,
      );
      expect(path).not.toBeNull();
    }
  });

  it('se abre desde WHITEBOARD_REACH casillas o menos, también en diagonal', () => {
    expect(WHITEBOARD_REACH).toBe(2);
    expect(whiteboardNear(map, { x: 4, y: 1 })?.id).toBe('board-1');
    expect(whiteboardNear(map, { x: 1, y: 2 })?.id).toBe('board-1');
    expect(whiteboardNear(map, { x: 7, y: 2 })?.id).toBe('board-1');
    expect(whiteboardNear(map, { x: 4, y: 3 })).toBeNull();
    expect(whiteboardNear(map, { x: 8, y: 1 })).toBeNull();
  });

  it('whiteboardAt solo cuenta las casillas de la pizarra', () => {
    expect(whiteboardAt(map, { x: 5, y: 0 })?.id).toBe('board-1');
    expect(whiteboardAt(map, { x: 5, y: 1 })).toBeNull();
  });

  it('findPathWhere va a la casilla más cercana que cumple la condición', () => {
    const path = findPathWhere(map, { x: 8, y: 4 }, (x, y) => x === 8 && y === 2);
    expect(path).toEqual(['up', 'up']);
    expect(findPathWhere(map, { x: 1, y: 1 }, () => true)).toEqual([]);
    expect(findPathWhere(map, { x: 1, y: 1 }, () => false)).toBeNull();
  });

  it('falla si dos pizarras comparten id', () => {
    const tiled = tiledFromAscii(['S..'], 16, [], [{ name: 'A', x: 1, y: 0, width: 1, height: 1 }]);
    const layer = tiled.layers.at(-1)!;
    if (layer.type === 'objectgroup') layer.objects.push({ ...layer.objects[0]!, name: 'B' });
    expect(() => parseWorldMap(tiled)).toThrow(/mismo id/);
  });
});

describe('validación de elementos', () => {
  it('acepta un elemento normal y devuelve una copia', () => {
    const raw = element();
    const clean = sanitizeBoardElement(raw);
    expect(clean).toEqual(raw);
    expect(clean).not.toBe(raw);
  });

  it.each([
    ['sin id', { id: undefined }],
    ['id raro', { id: 'a b' }],
    ['tipo no permitido (imagen)', { type: 'image' }],
    ['tipo no permitido (iframe)', { type: 'embeddable' }],
    ['versión 0', { version: 0 }],
    ['versión no entera', { version: 1.5 }],
    ['isDeleted no booleano', { isDeleted: 'no' }],
    ['coordenada infinita', { x: Infinity }],
    ['coordenada enorme', { width: 1e9 }],
    ['binario', { customData: new Uint8Array(4) }],
    ['anidado demasiado', { customData: { a: { b: { c: { d: { e: { f: 1 } } } } } } }],
  ])('rechaza: %s', (_label, over) => {
    expect(sanitizeBoardElement(element(over))).toBeNull();
  });

  it('rechaza elementos demasiado grandes', () => {
    const points = Array.from({ length: WHITEBOARD_MAX_ELEMENT_BYTES / 8 }, (_, i) => [i, i]);
    expect(sanitizeBoardElement(element({ type: 'freedraw', points }))).toBeNull();
  });

  it('quita enlaces peligrosos y deja los http(s)', () => {
    expect(sanitizeBoardElement(element({ link: 'javascript:alert(1)' }))?.link).toBeNull();
    expect(sanitizeBoardElement(element({ link: 'https://example.com' }))?.link).toBe(
      'https://example.com',
    );
  });

  it('parseBoardUpdate descarta solo los elementos no válidos', () => {
    const msg = parseBoardUpdate({
      boardId: 'board-1',
      elements: [element(), element({ id: 'otro', type: 'image' })],
    });
    expect(msg?.elements.map((e) => e.id)).toEqual(['abc123']);
    expect(parseBoardUpdate({ boardId: '../x', elements: [element()] })).toBeNull();
    expect(parseBoardUpdate({ boardId: 'board-1', elements: [] })).toBeNull();
  });

  it('valida apertura y puntero', () => {
    expect(parseBoardOpen({ boardId: 'board-1' })).toEqual({ boardId: 'board-1' });
    expect(parseBoardOpen({ boardId: 3 })).toBeNull();
    const pointer = { boardId: 'board-1', x: 1, y: 2, tool: 'laser', button: 'down' };
    expect(parseBoardPointer(pointer)).toEqual(pointer);
    expect(parseBoardPointer({ ...pointer, tool: 'pen' })).toBeNull();
    expect(parseBoardPointer({ ...pointer, x: NaN })).toBeNull();
  });
});

describe('combinación de cambios', () => {
  const el = (version: number, versionNonce: number) =>
    element({ version, versionNonce }) as BoardElement;

  it('gana la versión más alta y, si empatan, el versionNonce más bajo', () => {
    expect(isNewerElement(el(1, 5), undefined)).toBe(true);
    expect(isNewerElement(el(2, 5), el(1, 1))).toBe(true);
    expect(isNewerElement(el(1, 1), el(2, 5))).toBe(false);
    expect(isNewerElement(el(2, 1), el(2, 5))).toBe(true);
    expect(isNewerElement(el(2, 5), el(2, 1))).toBe(false);
    // El mismo elemento no cuenta como cambio.
    expect(isNewerElement(el(2, 5), el(2, 5))).toBe(false);
  });

  it('chunkElements parte por tamaño sin perder elementos', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ i, pad: 'x'.repeat(50) }));
    const size = jsonSize(items[0]) + 1;
    const chunks = chunkElements(items, size * 3);
    expect(chunks.map((c) => c.length)).toEqual([3, 3, 3, 1]);
    expect(chunks.flat()).toEqual(items);
    expect(chunkElements([{ big: 'x'.repeat(100) }], 10)).toHaveLength(1);
  });
});
