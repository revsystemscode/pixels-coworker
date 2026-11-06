import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import { WorldScene } from './WorldScene.js';

declare global {
  interface Window {
    /** Solo en desarrollo: estado del juego para pruebas E2E y depuración. */
    __pixels?: {
      snapshot: () => ReturnType<WorldScene['debugSnapshot']> | null;
      game: Phaser.Game;
    };
  }
}

/** Monta Phaser dentro de React y lo destruye al desmontar. */
export function GameCanvas({ room }: { room: Room }) {
  const container = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container.current,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#12161f',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: [],
    });
    game.scene.add('world', WorldScene, true, { room });

    const scene = () => game.scene.getScene<WorldScene>('world') ?? null;
    let fpsTimer: number | undefined;
    if (import.meta.env.DEV) {
      window.__pixels = { snapshot: () => scene()?.debugSnapshot() ?? null, game };
      fpsTimer = window.setInterval(() => setFps(Math.round(game.loop.actualFps)), 500);
    }

    return () => {
      window.clearInterval(fpsTimer);
      delete window.__pixels;
      game.destroy(true);
    };
  }, [room]);

  return (
    <>
      <div ref={container} className="game-canvas" />
      {fps !== null && <span className="fps">{fps} FPS</span>}
    </>
  );
}
