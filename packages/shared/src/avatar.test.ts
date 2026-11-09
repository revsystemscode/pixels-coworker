import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX,
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_COLORS,
  decodeAvatar,
  encodeAvatar,
  isAvatar,
} from './avatar.js';
import { AVATAR_COUNT } from './constants.js';

describe('aspecto del avatar', () => {
  it('los avatares de antes (solo personaje) siguen valiendo, con sus colores originales', () => {
    for (let base = 0; base < AVATAR_COUNT; base++) {
      expect(decodeAvatar(base)).toEqual({ base, shirt: 0, hair: 0, skin: 0 });
    }
  });

  it('codifica y decodifica cualquier combinación', () => {
    const look = {
      base: AVATAR_COUNT - 1,
      shirt: SHIRT_COLORS.length,
      hair: HAIR_COLORS.length,
      skin: SKIN_COLORS.length,
    };
    const n = encodeAvatar(look);
    expect(n).toBeLessThanOrEqual(AVATAR_MAX);
    expect(decodeAvatar(n)).toEqual(look);
    expect(decodeAvatar(encodeAvatar({ base: 2, shirt: 3, hair: 0, skin: 1 }))).toEqual({
      base: 2,
      shirt: 3,
      hair: 0,
      skin: 1,
    });
  });

  it('rechaza personajes o colores que no existen', () => {
    expect(isAvatar(AVATAR_COUNT)).toBe(false);
    expect(
      isAvatar(encodeAvatar({ base: 0, shirt: SHIRT_COLORS.length + 1, hair: 0, skin: 0 })),
    ).toBe(false);
    expect(
      isAvatar(encodeAvatar({ base: 0, shirt: 0, hair: 0, skin: SKIN_COLORS.length + 1 })),
    ).toBe(false);
    expect(isAvatar(-1)).toBe(false);
    expect(isAvatar(AVATAR_MAX + 1)).toBe(false);
    expect(isAvatar(1.5)).toBe(false);
    expect(isAvatar('3')).toBe(false);
  });
});
