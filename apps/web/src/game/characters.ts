import {
  HAIR_COLORS,
  MOVE_DURATION_MS,
  SHIRT_COLORS,
  SKIN_COLORS,
  decodeAvatar,
  type AvatarLook,
  type Direction,
  type PaletteColor,
} from '@pixels/shared';

/**
 * Hoja de personajes (Kenney RPG Urban, CC0), recortada por tools/prepare-assets.mjs:
 * 4 columnas (izquierda, abajo, arriba, derecha) × 18 filas (6 personajes × 3 frames).
 */
export const CHARACTER_SHEET = {
  key: 'characters',
  url: '/assets/characters/kenney-rpg-urban-characters.png',
  frameSize: 16,
  width: 64,
  height: 288,
};

const FRAME = CHARACTER_SHEET.frameSize;
const COLUMNS = 4;
/** Frames por personaje: quieto, paso 1 y paso 2. */
const ROWS = 3;
/** Cada personaje (con sus colores) es un bloque de la hoja de 64×48 px. */
export const LOOK_WIDTH = COLUMNS * FRAME;
export const LOOK_HEIGHT = ROWS * FRAME;
const DIR_COLUMN: Record<Direction, number> = { left: 0, down: 1, up: 2, right: 3 };

// Frames dentro del bloque de un personaje.
export const idleFrame = (dir: Direction) => DIR_COLUMN[dir];
/** Ciclo de caminar: paso 1, quieto, paso 2, quieto. */
export const walkFrames = (dir: Direction) => {
  const c = DIR_COLUMN[dir];
  return [COLUMNS + c, c, 2 * COLUMNS + c, c];
};
export const FRAMES_PER_LOOK = COLUMNS * ROWS;

/** Dos frames por casilla recorrida. */
export const WALK_FRAME_RATE = 2000 / MOVE_DURATION_MS;

// --- Colores ---

type Tone = 'main' | 'shade' | 'light';
/** Colores originales de una parte del dibujo y qué tono son; `rows`: filas del frame donde está. */
interface Part {
  from: Record<string, Tone>;
  rows?: [number, number];
}

const SKIN: Part = { from: { ffc999: 'main', f1b089: 'shade', ffc8a1: 'light' } };
/** Pelo: solo en la cabeza (los zapatos a veces son del mismo color). */
const HEAD: [number, number] = [0, 12];
/** Camiseta: solo en el torso. */
const TORSO: [number, number] = [9, 13];

/**
 * Colores que se pueden cambiar en cada personaje, sacados del dibujo de Kenney. Null: esa parte
 * no se puede cambiar (el obrero lleva casco; el calvo solo tiene barba, que cuenta como pelo).
 */
const PARTS: { shirt: Part; hair: Part | null; skin: Part }[] = [
  {
    shirt: { from: { '42a379': 'main', '369069': 'shade' }, rows: TORSO },
    hair: { from: { dc8652: 'main', c57652: 'shade' }, rows: HEAD },
    skin: SKIN,
  },
  {
    shirt: { from: { c2504d: 'main', a54240: 'shade' }, rows: TORSO },
    hair: { from: { dc8652: 'main', c57652: 'shade' }, rows: HEAD },
    skin: SKIN,
  },
  {
    shirt: { from: { dc8652: 'main', c57652: 'shade' }, rows: TORSO },
    hair: { from: { a09cca: 'main', '7a77a4': 'shade' }, rows: HEAD },
    skin: SKIN,
  },
  {
    // Peto azul (también en las piernas).
    shirt: { from: { '918eb9': 'main', '7a77a4': 'shade', a19dcc: 'main' }, rows: [9, 14] },
    hair: null,
    skin: { from: { b4734a: 'main', '955f3e': 'shade' } },
  },
  {
    shirt: { from: { aaa8bd: 'main', '898ca6': 'shade' }, rows: TORSO },
    hair: { from: { dc8652: 'main' }, rows: HEAD },
    skin: SKIN,
  },
  {
    shirt: { from: { c77b47: 'main', a9673b: 'shade' }, rows: TORSO },
    hair: { from: { '60605a': 'main', '50504a': 'shade' }, rows: HEAD },
    skin: SKIN,
  },
];

/** Si el personaje tiene pelo (o barba) al que cambiar el color. */
export const hasHair = (base: number) => PARTS[base]?.hair != null;

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const hexOf = (r: number, g: number, b: number) =>
  ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');

interface Swap {
  rows: [number, number];
  colors: Map<string, readonly [number, number, number]>;
}

function swapFor(part: Part | null, color: PaletteColor | undefined): Swap | null {
  if (!part || !color) return null;
  const colors = new Map(
    Object.entries(part.from).map(([hex, tone]) => [hex, rgb(color[tone] ?? color.main)]),
  );
  return { rows: part.rows ?? [0, FRAME - 1], colors };
}

/**
 * Pinta los colores elegidos sobre el bloque de un personaje (RGBA de LOOK_WIDTH × LOOK_HEIGHT).
 * Solo cambia los píxeles que tienen exactamente un color original de esa parte.
 */
export function recolor(pixels: Uint8ClampedArray, look: AvatarLook): void {
  const parts = PARTS[look.base];
  if (!parts) return;
  const swaps = [
    swapFor(parts.shirt, SHIRT_COLORS[look.shirt - 1]),
    swapFor(parts.hair, HAIR_COLORS[look.hair - 1]),
    swapFor(parts.skin, SKIN_COLORS[look.skin - 1]),
  ].filter((s): s is Swap => s !== null);
  if (swaps.length === 0) return;

  for (let y = 0; y < LOOK_HEIGHT; y++) {
    const row = y % FRAME;
    for (let x = 0; x < LOOK_WIDTH; x++) {
      const i = (y * LOOK_WIDTH + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const hex = hexOf(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      for (const swap of swaps) {
        const to = swap.colors.get(hex);
        if (!to || row < swap.rows[0] || row > swap.rows[1]) continue;
        [pixels[i], pixels[i + 1], pixels[i + 2]] = to;
        break;
      }
    }
  }
}

/** Dibuja en un canvas el bloque del personaje con sus colores (a partir de la hoja ya cargada). */
export function lookCanvas(sheet: CanvasImageSource, avatar: number): HTMLCanvasElement {
  const look = decodeAvatar(avatar) ?? { base: 0, shirt: 0, hair: 0, skin: 0 };
  const canvas = document.createElement('canvas');
  canvas.width = LOOK_WIDTH;
  canvas.height = LOOK_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet, 0, -look.base * LOOK_HEIGHT);
  const image = ctx.getImageData(0, 0, LOOK_WIDTH, LOOK_HEIGHT);
  recolor(image.data, look);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Hoja de personajes cargada una vez (para las vistas previas fuera de Phaser). */
let sheetPromise: Promise<HTMLImageElement> | null = null;
export function loadSheet(): Promise<HTMLImageElement> {
  sheetPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      sheetPromise = null;
      reject(new Error('No se pudo cargar la hoja de personajes'));
    };
    img.src = CHARACTER_SHEET.url;
  });
  return sheetPromise;
}

export const lookTextureKey = (avatar: number) => `look-${avatar}`;
export const walkAnimKey = (avatar: number, dir: Direction) => `walk-${avatar}-${dir}`;
