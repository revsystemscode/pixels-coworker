import type Phaser from 'phaser';
import { TILE_SIZE, type MapObject, type Whiteboard } from '@pixels/shared';

/**
 * Dibujo de las pizarras y los objetos del mapa con formas simples (los packs de Kenney no traen
 * pizarras, teles ni tablones). Coordenadas en píxeles del mundo.
 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recuadro dentro de un objeto de pared: deja ver un poco de pared alrededor. */
const wallBox = (r: { x: number; y: number; width: number; height: number }): Box => ({
  x: r.x * TILE_SIZE + 2,
  y: r.y * TILE_SIZE + 3,
  w: r.width * TILE_SIZE - 4,
  h: r.height * TILE_SIZE - 7,
});

export function drawWhiteboard(g: Phaser.GameObjects.Graphics, b: Whiteboard): Box {
  const { x, y, w, h } = wallBox(b);
  g.fillStyle(0x6b7280).fillRect(x, y, w, h); // marco
  g.fillStyle(0xf8fafc).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(0x9ca3af).fillRect(x + 2, y + h, w - 4, 2); // bandeja
  // Unos trazos de rotulador.
  g.fillStyle(0x3b82f6).fillRect(x + 4, y + 4, Math.min(14, w - 8), 1);
  g.fillStyle(0x3b82f6).fillRect(x + 4, y + 7, Math.min(9, w - 8), 1);
  g.fillStyle(0xef4444).fillRect(x + w - 14, y + 5, 8, 5);
  g.fillStyle(0xf8fafc).fillRect(x + w - 13, y + 6, 6, 3);
  return { x, y, w, h: h + 2 };
}

export function drawObject(g: Phaser.GameObjects.Graphics, o: MapObject): Box {
  if (o.kind === 'game') return drawGameTable(g, o);
  const box = wallBox(o);
  const { x, y, w, h } = box;
  if (o.kind === 'video') {
    // Tele en la pared: marco negro, pantalla y botón de reproducir.
    g.fillStyle(0x111827).fillRect(x, y, w, h);
    g.fillStyle(0x1e293b).fillRect(x + 2, y + 2, w - 4, h - 4);
    const cx = x + w / 2;
    const cy = y + h / 2;
    g.fillStyle(0xef4444).fillRoundedRect(cx - 6, cy - 4, 12, 8, 2);
    g.fillStyle(0xffffff).fillTriangle(cx - 2, cy - 2.5, cx - 2, cy + 2.5, cx + 3, cy);
  } else if (o.kind === 'note') {
    // Tablón de corcho con notas.
    g.fillStyle(0x7c4a21).fillRect(x, y, w, h);
    g.fillStyle(0xc8955a).fillRect(x + 1, y + 1, w - 2, h - 2);
    const notes = [
      [x + 3, y + 3, 0xfde68a],
      [x + w - 11, y + 4, 0xbbf7d0],
      [x + 6, y + h - 10, 0xfbcfe8],
    ] as const;
    for (const [nx, ny, color] of notes) {
      g.fillStyle(color).fillRect(nx, ny, 8, 7);
      g.fillStyle(0x9ca3af).fillRect(nx + 1, ny + 3, 5, 1);
      g.fillStyle(0xdc2626).fillRect(nx + 3, ny, 2, 1); // chincheta
    }
  } else {
    // Cartel con un eslabón de cadena (enlace).
    g.fillStyle(0x1f2937).fillRect(x, y, w, h);
    g.fillStyle(0x2563eb).fillRect(x + 1, y + 1, w - 2, h - 2);
    const cx = x + w / 2;
    const cy = y + h / 2 - 1;
    g.lineStyle(1.5, 0xffffff);
    g.strokeRoundedRect(cx - 8, cy - 3, 9, 6, 3);
    g.strokeRoundedRect(cx - 1, cy - 3, 9, 6, 3);
    g.fillStyle(0xbfdbfe).fillRect(x + 4, y + h - 5, w - 8, 1);
  }
  return box;
}

/** Tablero de tres en raya sobre la mesa (la mesa es del pack de Kenney). */
function drawGameTable(g: Phaser.GameObjects.Graphics, o: MapObject): Box {
  const size = 12;
  const x = o.x * TILE_SIZE + (o.width * TILE_SIZE - size) / 2;
  const y = o.y * TILE_SIZE + (o.height * TILE_SIZE - size) / 2 - 1;
  g.fillStyle(0xf5f5f4).fillRect(x, y, size, size);
  g.fillStyle(0x57534e);
  for (const d of [4, 8]) {
    g.fillRect(x + d, y + 1, 1, size - 2);
    g.fillRect(x + 1, y + d, size - 2, 1);
  }
  g.fillStyle(0xef4444).fillRect(x + 1, y + 1, 2, 2); // X
  g.fillStyle(0x2563eb).fillRect(x + 5, y + 5, 2, 2); // O
  g.fillStyle(0xef4444).fillRect(x + 9, y + 9, 2, 2);
  return {
    x: o.x * TILE_SIZE,
    y: o.y * TILE_SIZE,
    w: o.width * TILE_SIZE,
    h: o.height * TILE_SIZE,
  };
}
