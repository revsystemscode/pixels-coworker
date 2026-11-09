import { useEffect, useRef, useState } from 'react';
import {
  PALETTE,
  PALETTE_CATEGORIES,
  WALL_FACE,
  WALL_STYLES,
  WALL_TOP,
  baseGid,
  type PaletteCategory,
} from '@pixels/shared';
import { drawTile, loadTilesets } from './render.js';
import { useEditor, type Tool } from './store.js';

const PREVIEW = 40;

/** Miniatura de unos tiles (cabe en un cuadrado de PREVIEW px). */
function TilePreview({ tiles }: { tiles: number[][] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void loadTilesets().then((tilesets) => {
      const ctx = canvas.current?.getContext('2d');
      if (!alive || !ctx) return;
      const cols = Math.max(...tiles.map((r) => r.length));
      const size = Math.floor(PREVIEW / Math.max(cols, tiles.length));
      const ox = (PREVIEW - cols * size) / 2;
      const oy = (PREVIEW - tiles.length * size) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, PREVIEW, PREVIEW);
      tiles.forEach((row, y) =>
        row.forEach(
          (gid, x) => gid && drawTile(ctx, tilesets, gid, ox + x * size, oy + y * size, size),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [tiles]);
  return <canvas ref={canvas} width={PREVIEW} height={PREVIEW} aria-hidden="true" />;
}

/** Un trozo de pared con su cara, para elegir estilo. */
const wallPreview = (offset: number) => [
  [WALL_TOP.endRight, WALL_TOP.h, WALL_TOP.endLeft].map((id) => baseGid(id + offset)),
  [WALL_FACE.upperL, WALL_FACE.upper, WALL_FACE.upperR].map((id) => baseGid(id + offset)),
  [WALL_FACE.lowerL, WALL_FACE.lower, WALL_FACE.lowerR].map((id) => baseGid(id + offset)),
];

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  {
    tool: 'select',
    label: 'Seleccionar',
    hint: 'Elige una zona, pizarra u objeto para moverlo o cambiarlo',
  },
  { tool: 'erase', label: 'Borrar', hint: 'Quita el mueble, la alfombra o la pared de la casilla' },
  {
    tool: 'zone',
    label: 'Zona privada',
    hint: 'Arrastra para dibujar la zona: dentro solo se oye a los de dentro',
  },
  { tool: 'whiteboard', label: 'Pizarra', hint: 'Arrastra para dibujarla (mejor sobre una pared)' },
  { tool: 'object', label: 'Objeto', hint: 'Enlace, video, nota o mesa de juegos' },
  { tool: 'spawn', label: 'Inicio', hint: 'Donde aparece quien entra por primera vez' },
  { tool: 'block', label: 'Bloquear', hint: 'Marca casillas por las que no se puede pasar' },
  { tool: 'unblock', label: 'Desbloquear', hint: 'Deja pasar por casillas bloqueadas' },
];

const OBJECT_KINDS = [
  { kind: 'note', label: 'Nota' },
  { kind: 'link', label: 'Enlace' },
  { kind: 'video', label: 'Video' },
  { kind: 'game', label: 'Mesa de juegos' },
] as const;

/** Herramientas y paleta (columna izquierda). */
export function Palette() {
  const tool = useEditor((s) => s.tool);
  const item = useEditor((s) => s.item);
  const wallStyle = useEditor((s) => s.wallStyle);
  const objectKind = useEditor((s) => s.objectKind);
  const set = useEditor((s) => s.set);
  const [category, setCategory] = useState<PaletteCategory>('suelo');

  return (
    <aside className="editor-sidebar editor-tools" aria-label="Herramientas">
      <div className="editor-tool-grid" role="radiogroup" aria-label="Herramienta">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            role="radio"
            aria-checked={tool === t.tool}
            className={`secondary${tool === t.tool ? ' active' : ''}`}
            title={t.hint}
            onClick={() =>
              set({
                tool: t.tool,
                selection: t.tool === 'select' ? useEditor.getState().selection : null,
              })
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tool === 'object' && (
        <div className="editor-kinds" role="radiogroup" aria-label="Tipo de objeto">
          {OBJECT_KINDS.map((k) => (
            <label key={k.kind}>
              <input
                type="radio"
                name="object-kind"
                checked={objectKind === k.kind}
                onChange={() => set({ objectKind: k.kind })}
              />
              {k.label}
            </label>
          ))}
        </div>
      )}

      <h3>Paredes</h3>
      <div className="editor-palette">
        {WALL_STYLES.map((w, i) => (
          <button
            key={w.id}
            type="button"
            className={`palette-item${tool === 'wall' && wallStyle === i + 1 ? ' active' : ''}`}
            aria-pressed={tool === 'wall' && wallStyle === i + 1}
            title={`${w.name}: se unen solas y llevan su cara debajo`}
            onClick={() => set({ tool: 'wall', wallStyle: i + 1, selection: null })}
          >
            <TilePreview tiles={wallPreview(w.offset)} />
            <span>{w.name}</span>
          </button>
        ))}
      </div>

      <h3>Paleta</h3>
      <div className="editor-categories" role="tablist" aria-label="Categoría">
        {PALETTE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`link-button${category === c.id ? ' active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="editor-palette">
        {PALETTE.filter((p) => p.category === category).map((p) => (
          <button
            key={p.id}
            type="button"
            className={`palette-item${tool === 'paint' && item.id === p.id ? ' active' : ''}`}
            aria-pressed={tool === 'paint' && item.id === p.id}
            title={p.blocks ? `${p.name} (no se puede pasar)` : p.name}
            onClick={() => set({ tool: 'paint', item: p, selection: null })}
          >
            <TilePreview tiles={p.tiles} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
