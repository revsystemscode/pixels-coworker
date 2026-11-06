import { CHARACTER_SHEET, idleFrame } from '../game/characters.js';

const SHEET_COLUMNS = 4;
const FRAME = 16;

/** Dibuja el frame "quieto mirando abajo" de un avatar usando CSS (sin Phaser). */
export function AvatarPreview({ avatar, scale = 3 }: { avatar: number; scale?: number }) {
  const frame = idleFrame(avatar, 'down');
  const col = frame % SHEET_COLUMNS;
  const row = Math.floor(frame / SHEET_COLUMNS);
  return (
    <span
      className="avatar-preview"
      aria-hidden="true"
      style={{
        width: FRAME * scale,
        height: FRAME * scale,
        backgroundImage: `url(${CHARACTER_SHEET.url})`,
        backgroundSize: `${CHARACTER_SHEET.width * scale}px ${CHARACTER_SHEET.height * scale}px`,
        backgroundPosition: `-${col * FRAME * scale}px -${row * FRAME * scale}px`,
      }}
    />
  );
}
