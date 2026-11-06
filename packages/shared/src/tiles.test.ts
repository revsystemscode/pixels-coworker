import { describe, expect, it } from 'vitest';
import { pixelToTile, tileDistance, tileToPixel } from './tiles.js';

describe('tiles', () => {
  it('tileToPixel devuelve el centro del tile', () => {
    expect(tileToPixel({ x: 0, y: 0 }, 32)).toEqual({ x: 16, y: 16 });
    expect(tileToPixel({ x: 2, y: 3 }, 32)).toEqual({ x: 80, y: 112 });
  });

  it('pixelToTile es la inversa de tileToPixel', () => {
    const tile = { x: 7, y: 4 };
    expect(pixelToTile(tileToPixel(tile))).toEqual(tile);
  });

  it('pixelToTile redondea hacia abajo en los bordes', () => {
    expect(pixelToTile({ x: 31.9, y: 32 }, 32)).toEqual({ x: 0, y: 1 });
  });

  it('tileDistance mide en tiles', () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 96, y: 128 }, 32)).toBe(5);
  });
});
