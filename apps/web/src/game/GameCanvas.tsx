import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import type { TiledMap } from '@pixels/shared';
import type { MediaSession } from '../media/MediaSession.js';
import { useApp } from '../store.js';
import { VideoBubbles } from '../ui/VideoBubbles.js';
import { WorldScene } from './WorldScene.js';

declare global {
  interface Window {
    /** Solo en desarrollo: estado del juego para pruebas E2E y depuración. */
    __pixels?: {
      snapshot: () => ReturnType<WorldScene['debugSnapshot']> | null;
      media: () => ReturnType<MediaSession['debugSnapshot']> | null;
      walkTo: (x: number, y: number) => boolean;
      game: Phaser.Game;
      /** Lo dibujado en la pizarra abierta (solo mientras hay una abierta). */
      board?: () => { id: string; type: string }[];
    };
  }
}

/** Monta Phaser dentro de React y lo destruye al desmontar. */
export function GameCanvas({
  room,
  map,
  selfName,
}: {
  room: Room;
  map: TiledMap;
  selfName: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const getPositions = useCallback(
    () =>
      gameRef.current?.scene.getScene<WorldScene>('world')?.headPositions() ??
      new Map<string, { x: number; y: number }>(),
    [],
  );

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
    game.scene.add('world', WorldScene, true, { room, map });
    gameRef.current = game;

    const scene = () => game.scene.getScene<WorldScene>('world') ?? null;
    let fpsTimer: number | undefined;
    if (import.meta.env.DEV) {
      window.__pixels = {
        snapshot: () => scene()?.debugSnapshot() ?? null,
        media: () => useApp.getState().media?.debugSnapshot() ?? null,
        walkTo: (x, y) => scene()?.debugWalkTo({ x, y }) ?? false,
        game,
      };
      fpsTimer = window.setInterval(() => setFps(Math.round(game.loop.actualFps)), 500);
    }

    return () => {
      window.clearInterval(fpsTimer);
      delete window.__pixels;
      gameRef.current = null;
      game.destroy(true);
    };
  }, [room, map]);

  return (
    <>
      <div ref={container} className="game-canvas" />
      <VideoBubbles selfId={room.sessionId} selfName={selfName} getPositions={getPositions} />
      {fps !== null && <span className="fps">{fps} FPS</span>}
    </>
  );
}
