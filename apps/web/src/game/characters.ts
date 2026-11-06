import { MOVE_DURATION_MS, type Direction } from '@pixels/shared';

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

const COLUMNS = 4;
const DIR_COLUMN: Record<Direction, number> = { left: 0, down: 1, up: 2, right: 3 };

const frame = (avatar: number, row: number, dir: Direction) =>
  (avatar * 3 + row) * COLUMNS + DIR_COLUMN[dir];

export const idleFrame = (avatar: number, dir: Direction) => frame(avatar, 0, dir);

/** Ciclo de caminar: paso 1, quieto, paso 2, quieto. */
export const walkFrames = (avatar: number, dir: Direction) => [
  frame(avatar, 1, dir),
  frame(avatar, 0, dir),
  frame(avatar, 2, dir),
  frame(avatar, 0, dir),
];

export const walkAnimKey = (avatar: number, dir: Direction) => `walk-${avatar}-${dir}`;

/** Dos frames por casilla recorrida. */
export const WALK_FRAME_RATE = 2000 / MOVE_DURATION_MS;
