import {
  TILESETS,
  TILE_SIZE_PX,
  TILE_LAYERS,
  tileSource,
  type EditableMap,
  type MapRect,
  type Point,
} from '@pixels/shared';
import type { Selection } from './store.js';

const T = TILE_SIZE_PX;

/** Imágenes de los tilesets, cargadas una vez. */
let images: Promise<Map<string, HTMLImageElement>> | null = null;
export function loadTilesets(): Promise<Map<string, HTMLImageElement>> {
  images ??= Promise.all(
    TILESETS.map(
      (ts) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([ts.name, img]);
          img.onerror = () => reject(new Error(`No se pudo cargar ${ts.url}`));
          img.src = ts.url;
        }),
    ),
  ).then((list) => new Map(list));
  images.catch(() => (images = null));
  return images;
}

/** Dibuja un tile (gid) en (x, y) píxeles, a `size` píxeles. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tilesets: Map<string, HTMLImageElement>,
  gid: number,
  x: number,
  y: number,
  size = T,
) {
  const src = tileSource(gid);
  const img = src && tilesets.get(src.tileset.name);
  if (!src || !img) return;
  ctx.drawImage(img, src.col * (T + 1), src.row * (T + 1), T, T, x, y, size, size);
}

/**
 * Las capas de tiles del mapa, en un canvas a tamaño real (1 px = 1 px del mapa). Solo se redibujan
 * las casillas que cambian.
 */
export class TileCanvas {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;

  constructor(private readonly tilesets: Map<string, HTMLImageElement>) {}

  draw(map: EditableMap, cells: Iterable<number> | null) {
    if (
      cells === null ||
      this.canvas.width !== map.width * T ||
      this.canvas.height !== map.height * T
    ) {
      this.canvas.width = map.width * T;
      this.canvas.height = map.height * T;
      cells = map.collision.keys();
    }
    for (const i of cells) {
      const x = (i % map.width) * T;
      const y = Math.floor(i / map.width) * T;
      this.ctx.fillStyle = '#12161f';
      this.ctx.fillRect(x, y, T, T);
      for (const layer of TILE_LAYERS) {
        const gid = map.layers[layer][i]!;
        if (gid) drawTile(this.ctx, this.tilesets, gid, x, y);
      }
    }
  }
}

const OBJECT_COLORS = {
  link: '#3b82f6',
  video: '#ef4444',
  note: '#eab308',
  game: '#22c55e',
} as const;

export interface Overlay {
  zoom: number;
  showGrid: boolean;
  showCollision: boolean;
  selection: Selection | null;
  /** Casilla bajo el ratón. */
  hover: Point | null;
  /** Vista previa de lo que se va a pintar (gids por filas) o de una casilla. */
  ghost: { tiles: number[][] } | { cell: true } | null;
  /** Rectángulo que se está dibujando. */
  dragRect: { x: number; y: number; width: number; height: number } | null;
}

/** Dibuja el mapa (ya pintado en `tiles`) a escala y, encima, lo que no son tiles. */
export function drawEditor(
  ctx: CanvasRenderingContext2D,
  tilesets: Map<string, HTMLImageElement>,
  tiles: HTMLCanvasElement,
  map: EditableMap,
  o: Overlay,
) {
  const s = T * o.zoom;
  const W = map.width * s;
  const H = map.height * s;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(tiles, 0, 0, W, H);

  if (o.showCollision) {
    ctx.fillStyle = 'rgb(239 68 68 / 0.35)';
    map.collision.forEach((v, i) => {
      if (v) ctx.fillRect((i % map.width) * s, Math.floor(i / map.width) * s, s, s);
    });
  }

  if (o.showGrid && o.zoom >= 2) {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, H);
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(W, y * s + 0.5);
    }
    ctx.stroke();
  }

  const box = (r: { x: number; y: number; width: number; height: number }) =>
    [r.x * s, r.y * s, r.width * s, r.height * s] as const;
  const label = (text: string, r: MapRect, color: string) => {
    ctx.font = `600 ${Math.max(10, 4 * o.zoom + 4)}px system-ui, sans-serif`;
    const [x, y] = box(r);
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgb(18 22 31 / 0.85)';
    ctx.fillRect(x + 2, y + 2, w, 4 * o.zoom + 10);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 6, y + 4 * o.zoom + 7);
  };

  for (const z of map.zones) {
    ctx.fillStyle = 'rgb(91 141 239 / 0.15)';
    ctx.fillRect(...box(z));
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#5b8def';
    ctx.lineWidth = 2;
    ctx.strokeRect(...box(z));
    ctx.setLineDash([]);
    label(`Zona: ${z.name}`, z, '#93b4f5');
  }
  for (const b of map.whiteboards) {
    ctx.fillStyle = 'rgb(248 250 252 / 0.55)';
    ctx.fillRect(...box(b));
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(...box(b));
    label(`Pizarra: ${b.name}`, b, '#e2e8f0');
  }
  for (const obj of map.objects) {
    const color = OBJECT_COLORS[obj.kind];
    ctx.fillStyle = `${color}55`;
    ctx.fillRect(...box(obj));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(...box(obj));
    label(obj.name, obj, color);
  }

  // Punto de inicio.
  const cx = (map.spawn.x + 0.5) * s;
  const cy = (map.spawn.y + 0.5) * s;
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#052e16';
  ctx.font = `700 ${Math.round(s * 0.45)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', cx, cy + 1);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  if (o.selection) {
    const r = (map[o.selection.layer] as MapRect[]).find((x) => x.id === o.selection!.id);
    if (r) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.strokeRect(...box(r));
    }
  }

  if (o.dragRect) {
    ctx.fillStyle = 'rgb(250 204 21 / 0.2)';
    ctx.fillRect(...box(o.dragRect));
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(...box(o.dragRect));
  } else if (o.hover && o.ghost) {
    ctx.globalAlpha = 0.65;
    if ('tiles' in o.ghost) {
      o.ghost.tiles.forEach((row, dy) =>
        row.forEach((gid, dx) => {
          if (gid) drawTile(ctx, tilesets, gid, (o.hover!.x + dx) * s, (o.hover!.y + dy) * s, s);
        }),
      );
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    const rows = 'tiles' in o.ghost ? o.ghost.tiles.length : 1;
    const cols = 'tiles' in o.ghost ? Math.max(...o.ghost.tiles.map((r) => r.length)) : 1;
    ctx.strokeRect(o.hover.x * s, o.hover.y * s, cols * s, rows * s);
  }
}
