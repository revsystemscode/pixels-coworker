import { AVATAR_COUNT } from './constants.js';

/**
 * Aspecto del avatar: uno de los AVATAR_COUNT personajes y, opcionalmente, otro color de camiseta,
 * de pelo y de piel (0 = el color original del dibujo). Se guarda y viaja como un solo número
 * (`encodeAvatar`), así que los avatares de antes (0..AVATAR_COUNT-1) siguen siendo válidos.
 */
export interface AvatarLook {
  base: number;
  shirt: number;
  hair: number;
  skin: number;
}

/** Un color de la paleta: tono principal y sombra (y brillo, en la piel). */
export interface PaletteColor {
  name: string;
  main: string;
  shade: string;
  light?: string;
}

/** Índice 0 = sin cambiar (no está en las listas). */
export const SHIRT_COLORS: readonly PaletteColor[] = [
  { name: 'Rojo', main: '#c2504d', shade: '#a54240' },
  { name: 'Verde', main: '#42a379', shade: '#369069' },
  { name: 'Azul', main: '#4f86d9', shade: '#3d6bb5' },
  { name: 'Amarillo', main: '#e6c34a', shade: '#c7a43b' },
  { name: 'Morado', main: '#9a63c4', shade: '#7c4ba3' },
  { name: 'Rosa', main: '#e47aa6', shade: '#c45f8a' },
  { name: 'Negro', main: '#4a4f5c', shade: '#383c47' },
  { name: 'Blanco', main: '#ecedf0', shade: '#c9cbd3' },
];

export const HAIR_COLORS: readonly PaletteColor[] = [
  { name: 'Negro', main: '#3d3a3a', shade: '#2b2929' },
  { name: 'Castaño', main: '#8a5532', shade: '#6c4026' },
  { name: 'Pelirrojo', main: '#dc8652', shade: '#c57652' },
  { name: 'Rubio', main: '#f0cf6c', shade: '#d4b051' },
  { name: 'Canoso', main: '#d9d9e0', shade: '#b3b3bf' },
  { name: 'Azul', main: '#5b84db', shade: '#4568b8' },
  { name: 'Rosa', main: '#e07fb8', shade: '#c063a0' },
];

export const SKIN_COLORS: readonly PaletteColor[] = [
  { name: 'Muy clara', main: '#ffe0c4', shade: '#f5c7a3', light: '#ffe4cc' },
  { name: 'Clara', main: '#ffc999', shade: '#f1b089', light: '#ffc8a1' },
  { name: 'Media', main: '#e0a072', shade: '#c8875a', light: '#e3a67a' },
  { name: 'Morena', main: '#b4734a', shade: '#955f3e', light: '#b97a52' },
  { name: 'Oscura', main: '#7b4b2f', shade: '#633a23', light: '#815237' },
];

// Cada parte ocupa unos bits del número: base (3), camiseta (4), pelo (4) y piel (3).
const BITS = { base: 0, shirt: 3, hair: 7, skin: 11 } as const;
const MASK = { base: 0b111, shirt: 0b1111, hair: 0b1111, skin: 0b111 } as const;
const MAX = {
  base: AVATAR_COUNT - 1,
  shirt: SHIRT_COLORS.length,
  hair: HAIR_COLORS.length,
  skin: SKIN_COLORS.length,
} as const;
/** Mayor número posible (cabe en 16 bits). */
export const AVATAR_MAX = (1 << 14) - 1;

const PARTS = ['base', 'shirt', 'hair', 'skin'] as const;

export function encodeAvatar(look: AvatarLook): number {
  return PARTS.reduce((n, part) => n | (look[part] << BITS[part]), 0);
}

/** El aspecto que representa el número, o null si no es válido. */
export function decodeAvatar(raw: unknown): AvatarLook | null {
  if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > AVATAR_MAX) return null;
  const n = raw as number;
  const look = {} as AvatarLook;
  for (const part of PARTS) {
    look[part] = (n >> BITS[part]) & MASK[part];
    if (look[part] > MAX[part]) return null;
  }
  return look;
}

export const isAvatar = (raw: unknown): raw is number => decodeAvatar(raw) !== null;
