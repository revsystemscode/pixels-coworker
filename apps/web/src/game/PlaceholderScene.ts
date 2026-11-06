import Phaser from 'phaser';
import { TILE_SIZE } from '@pixels/shared';

/** Escena provisional: una cuadrícula de tiles. En la Fase 1 se reemplaza por el mapa de Tiled. */
export class PlaceholderScene extends Phaser.Scene {
  constructor() {
    super('placeholder');
  }

  create() {
    const { width, height } = this.scale;
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x2f3a4f, 1);
    for (let x = 0; x <= width; x += TILE_SIZE) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += TILE_SIZE) grid.lineBetween(0, y, width, y);

    this.add
      .text(width / 2, height / 2, 'Phaser listo · el mapa llega en la Fase 1', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#c9d4e8',
      })
      .setOrigin(0.5);
  }
}
