import { useEffect, useRef } from 'react';
import { CHARACTER_SHEET, idleFrame, loadSheet, lookCanvas } from '../game/characters.js';

const FRAME = CHARACTER_SHEET.frameSize;

/** Bloques ya pintados, por aspecto (se repiten en listas de miembros, cabeceras…). */
const looks = new Map<number, HTMLCanvasElement>();

/** Dibuja el frame "quieto mirando abajo" de un avatar, con sus colores (sin Phaser). */
export function AvatarPreview({ avatar, scale = 3 }: { avatar: number; scale?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadSheet()
      .then((sheet) => {
        const target = canvas.current;
        if (!alive || !target) return;
        let look = looks.get(avatar);
        if (!look) {
          look = lookCanvas(sheet, avatar);
          looks.set(avatar, look);
        }
        const ctx = target.getContext('2d')!;
        ctx.clearRect(0, 0, FRAME, FRAME);
        ctx.drawImage(look, idleFrame('down') * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [avatar]);

  return (
    <canvas
      ref={canvas}
      className="avatar-preview"
      aria-hidden="true"
      width={FRAME}
      height={FRAME}
      style={{ width: FRAME * scale, height: FRAME * scale }}
    />
  );
}
