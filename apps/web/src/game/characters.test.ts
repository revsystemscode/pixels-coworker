import { describe, expect, it } from 'vitest';
import { HAIR_COLORS, SHIRT_COLORS, SKIN_COLORS } from '@pixels/shared';
import { LOOK_HEIGHT, LOOK_WIDTH, hasHair, recolor } from './characters.js';

const hex = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Bloque vacío con algunos píxeles de colores del dibujo original. */
function block(pixels: { x: number; y: number; color: string }[]) {
  const data = new Uint8ClampedArray(LOOK_WIDTH * LOOK_HEIGHT * 4);
  for (const p of pixels) data.set([...hex(p.color), 255], (p.y * LOOK_WIDTH + p.x) * 4);
  return data;
}
const at = (data: Uint8ClampedArray, x: number, y: number) => [
  ...data.slice((y * LOOK_WIDTH + x) * 4, (y * LOOK_WIDTH + x) * 4 + 3),
];

describe('recolor', () => {
  it('cambia camiseta, pelo y piel, pero no los zapatos del mismo color que el pelo', () => {
    const data = block([
      { x: 20, y: 3, color: 'dc8652' }, // pelo
      { x: 20, y: 15, color: 'dc8652' }, // zapato (mismo color)
      { x: 20, y: 11, color: '42a379' }, // camiseta
      { x: 21, y: 11, color: '369069' }, // sombra de la camiseta
      { x: 20, y: 7, color: 'ffc999' }, // piel
      { x: 20, y: 16 + 3, color: 'dc8652' }, // pelo en el frame de abajo (paso 1)
    ]);
    recolor(data, { base: 0, shirt: 3, hair: 4, skin: 5 });
    expect(at(data, 20, 3)).toEqual(hex(HAIR_COLORS[3]!.main));
    expect(at(data, 20, 19)).toEqual(hex(HAIR_COLORS[3]!.main));
    expect(at(data, 20, 15)).toEqual(hex('dc8652'));
    expect(at(data, 20, 11)).toEqual(hex(SHIRT_COLORS[2]!.main));
    expect(at(data, 21, 11)).toEqual(hex(SHIRT_COLORS[2]!.shade));
    expect(at(data, 20, 7)).toEqual(hex(SKIN_COLORS[4]!.main));
  });

  it('con los colores originales no toca nada', () => {
    const data = block([{ x: 1, y: 1, color: 'dc8652' }]);
    const before = [...data];
    recolor(data, { base: 0, shirt: 0, hair: 0, skin: 0 });
    expect([...data]).toEqual(before);
  });

  it('el obrero (casco) no tiene pelo que cambiar', () => {
    expect(hasHair(3)).toBe(false);
    expect(hasHair(0)).toBe(true);
  });
});
