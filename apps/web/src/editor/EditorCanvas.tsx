import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TILE_SIZE_PX, type MapRect, type Point } from '@pixels/shared';
import { TileCanvas, drawEditor, loadTilesets, type Overlay } from './render.js';
import { useEditor, type RectLayer, type Tool } from './store.js';

const RECT_TOOLS: Partial<Record<Tool, RectLayer>> = {
  zone: 'zones',
  whiteboard: 'whiteboards',
  object: 'objects',
};
/** Herramientas que pintan casilla a casilla mientras se arrastra. */
const BRUSHES: Tool[] = ['paint', 'wall', 'erase', 'block', 'unblock'];

type Drag =
  | { kind: 'brush'; last: string }
  | { kind: 'rect'; layer: RectLayer; start: Point; end: Point }
  | { kind: 'move'; start: Point; origin: Point; moved: boolean };

/** Lienzo del editor: dibuja el mapa y convierte el ratón en acciones de la herramienta elegida. */
export function EditorCanvas({ onMessage }: { onMessage: (message: string | null) => void }) {
  const map = useEditor((s) => s.map);
  const rev = useEditor((s) => s.rev);
  const zoom = useEditor((s) => s.zoom);
  const tool = useEditor((s) => s.tool);
  const item = useEditor((s) => s.item);
  const showGrid = useEditor((s) => s.showGrid);
  const showCollision = useEditor((s) => s.showCollision);
  const selection = useEditor((s) => s.selection);

  const canvas = useRef<HTMLCanvasElement>(null);
  const tiles = useRef<TileCanvas | null>(null);
  const [tilesets, setTilesets] = useState<Map<string, HTMLImageElement> | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragRect, setDragRect] = useState<Overlay['dragRect']>(null);

  useEffect(() => {
    loadTilesets()
      .then((loaded) => {
        tiles.current = new TileCanvas(loaded);
        setTilesets(loaded);
      })
      .catch(() => onMessage('No se pudieron cargar los tilesets.'));
  }, [onMessage]);

  // Dibuja (como mucho una vez por fotograma) cuando cambia algo.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !map || !tilesets || !tiles.current) return;
    const frame = requestAnimationFrame(() => {
      const state = useEditor.getState();
      tiles.current!.draw(map, state.dirty);
      useEditor.setState({ dirty: new Set() });
      const ghost: Overlay['ghost'] =
        tool === 'paint'
          ? { tiles: item.tiles }
          : BRUSHES.includes(tool) || tool === 'spawn'
            ? { cell: true }
            : null;
      drawEditor(ctx, tilesets, tiles.current!.canvas, map, {
        zoom,
        showGrid,
        showCollision,
        selection,
        hover,
        ghost,
        dragRect,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [map, rev, zoom, tool, item, showGrid, showCollision, selection, hover, dragRect, tilesets]);

  if (!map) return null;
  const size = TILE_SIZE_PX * zoom;

  const cellOf = (e: ReactPointerEvent): Point => {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) / size),
      y: Math.floor((e.clientY - rect.top) / size),
    };
  };
  const clamp = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, 0), map.width - 1),
    y: Math.min(Math.max(p.y, 0), map.height - 1),
  });
  const normalize = (a: Point, b: Point) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
  });

  const brush = (p: Point) => {
    const s = useEditor.getState();
    if (tool === 'paint') s.paint(p);
    else if (tool === 'wall') s.wall(p);
    else if (tool === 'erase') s.erase(p);
    else if (tool === 'block' || tool === 'unblock') s.setBlocked(p, tool === 'block');
  };

  /** Rectángulo (objeto, pizarra o zona) bajo la casilla; los objetos van encima. */
  const hit = (p: Point) => {
    for (const layer of ['objects', 'whiteboards', 'zones'] as const) {
      const r = (map[layer] as MapRect[]).findLast(
        (r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height,
      );
      if (r) return { layer, id: r.id, rect: r };
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = clamp(cellOf(e));
    const s = useEditor.getState();
    onMessage(null);
    if (BRUSHES.includes(tool)) {
      s.checkpoint();
      brush(p);
      drag.current = { kind: 'brush', last: `${p.x},${p.y}` };
    } else if (RECT_TOOLS[tool]) {
      drag.current = { kind: 'rect', layer: RECT_TOOLS[tool], start: p, end: p };
      setDragRect(normalize(p, p));
    } else if (tool === 'spawn') {
      onMessage(s.setSpawn(p));
    } else if (tool === 'select') {
      const found = hit(p);
      s.set({ selection: found ? { layer: found.layer, id: found.id } : null });
      if (found) {
        drag.current = {
          kind: 'move',
          start: p,
          origin: { x: found.rect.x, y: found.rect.y },
          moved: false,
        };
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = cellOf(e);
    const inside = p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
    setHover((h) => (inside ? (h?.x === p.x && h.y === p.y ? h : p) : null));
    const d = drag.current;
    if (!d) return;
    const c = clamp(p);
    if (d.kind === 'brush') {
      const key = `${c.x},${c.y}`;
      if (key !== d.last) {
        d.last = key;
        brush(c);
      }
    } else if (d.kind === 'rect') {
      d.end = c;
      setDragRect(normalize(d.start, c));
    } else if (d.kind === 'move') {
      const s = useEditor.getState();
      const sel = s.selection;
      const rect = sel && (map[sel.layer] as MapRect[]).find((r) => r.id === sel.id);
      if (!sel || !rect) return;
      const x = Math.min(Math.max(d.origin.x + c.x - d.start.x, 0), map.width - rect.width);
      const y = Math.min(Math.max(d.origin.y + c.y - d.start.y, 0), map.height - rect.height);
      if (x === rect.x && y === rect.y) return;
      if (!d.moved) s.checkpoint();
      d.moved = true;
      s.updateRect(sel, { x, y });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'rect') {
      setDragRect(null);
      const s = useEditor.getState();
      s.checkpoint();
      s.addRect(d.layer, normalize(d.start, d.end));
    }
  };

  return (
    <canvas
      ref={canvas}
      className={`editor-canvas tool-${tool}`}
      width={map.width * size}
      height={map.height * size}
      style={{ width: map.width * size, height: map.height * size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      aria-label="Mapa"
      data-testid="editor-canvas"
    />
  );
}
