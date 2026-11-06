import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { PlaceholderScene } from './PlaceholderScene.js';

/** Monta Phaser dentro de React y lo destruye al desmontar. */
export function GameCanvas() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container.current,
      width: 640,
      height: 384,
      pixelArt: true,
      backgroundColor: '#1d2330',
      scene: [PlaceholderScene],
    });
    return () => game.destroy(true);
  }, []);

  return <div ref={container} className="game-canvas" />;
}
