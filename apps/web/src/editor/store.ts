import { create } from 'zustand';
import {
  PALETTE,
  checkPlayable,
  cloneMap,
  rebuildWalls,
  recomputeCollision,
  wallGridOf,
  type EditableMap,
  type MapObjectKind,
  type MapRect,
  type PaletteItem,
  type Point,
} from '@pixels/shared';

export type Tool =
  | 'paint'
  | 'wall'
  | 'erase'
  | 'block'
  | 'unblock'
  | 'zone'
  | 'whiteboard'
  | 'object'
  | 'spawn'
  | 'select';

/** Capas de rectángulos que se pueden seleccionar. */
export type RectLayer = 'zones' | 'whiteboards' | 'objects';
export interface Selection {
  layer: RectLayer;
  id: number;
}

interface Snapshot {
  map: EditableMap;
  walls: Uint8Array;
}

const HISTORY_LIMIT = 50;

interface EditorState {
  map: EditableMap | null;
  /** Estilo de pared de cada casilla (0 = sin pared). La capa de paredes se calcula de aquí. */
  walls: Uint8Array;
  /** Sube con cada cambio (para redibujar y para el guardado automático). */
  rev: number;
  /** Casillas cambiadas desde el último dibujo; null = redibujar todo. */
  dirty: Set<number> | null;
  /** Hay cambios sin guardar en el borrador. */
  unsaved: boolean;
  past: Snapshot[];
  future: Snapshot[];

  tool: Tool;
  item: PaletteItem;
  wallStyle: number;
  objectKind: MapObjectKind;
  selection: Selection | null;
  zoom: number;
  showCollision: boolean;
  showGrid: boolean;

  /** Carga un mapa (al abrir, importar, empezar de nuevo o cambiar el tamaño). */
  load: (map: EditableMap, options?: { unsaved?: boolean; keepHistory?: boolean }) => void;
  /** Guarda el estado actual para poder deshacer (al empezar cada trazo). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  set: (
    patch: Partial<
      Pick<
        EditorState,
        | 'tool'
        | 'item'
        | 'wallStyle'
        | 'objectKind'
        | 'zoom'
        | 'showCollision'
        | 'showGrid'
        | 'selection'
      >
    >,
  ) => void;

  paint: (cell: Point) => void;
  wall: (cell: Point) => void;
  erase: (cell: Point) => void;
  setBlocked: (cell: Point, blocked: boolean) => void;
  setSpawn: (cell: Point) => string | null;
  addRect: (layer: RectLayer, rect: Omit<MapRect, 'id' | 'name'>) => void;
  updateRect: (selection: Selection, patch: Partial<MapRect> & { value?: string }) => void;
  deleteSelection: () => void;
  /** El borrador se guardó tal como estaba en `rev` (si hubo cambios después, siguen sin guardar). */
  markSaved: (rev: number) => void;
}

const DEFAULT_NAMES: Record<RectLayer | MapObjectKind, string> = {
  zones: 'Zona privada',
  whiteboards: 'Pizarra',
  objects: 'Objeto',
  link: 'Enlace',
  video: 'Video',
  note: 'Nota',
  game: 'Mesa de juegos',
};

export const useEditor = create<EditorState>((set, get) => {
  /** Aplica un cambio al mapa y anota qué casillas hay que redibujar. */
  const change = (fn: (map: EditableMap) => Iterable<number> | null) => {
    const { map, dirty, rev } = get();
    if (!map) return;
    const cells = fn(map);
    let next: Set<number> | null = dirty;
    if (cells === null) next = null;
    else if (next) for (const c of cells) next.add(c);
    set({ rev: rev + 1, dirty: next, unsaved: true });
  };
  const inside = (map: EditableMap, p: Point) =>
    p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;

  return {
    map: null,
    walls: new Uint8Array(0),
    rev: 0,
    dirty: null,
    unsaved: false,
    past: [],
    future: [],
    tool: 'paint',
    item: PALETTE[0]!,
    wallStyle: 1,
    objectKind: 'note',
    selection: null,
    zoom: 2,
    showCollision: false,
    showGrid: true,

    load: (map, options = {}) => {
      if (options.keepHistory) get().checkpoint();
      set({
        map,
        walls: wallGridOf(map),
        rev: get().rev + 1,
        dirty: null,
        unsaved: options.unsaved ?? false,
        selection: null,
        ...(options.keepHistory ? {} : { past: [], future: [] }),
      });
    },

    checkpoint: () => {
      const { map, walls, past } = get();
      if (!map) return;
      set({
        past: [...past, { map: cloneMap(map), walls: walls.slice() }].slice(-HISTORY_LIMIT),
        future: [],
      });
    },

    undo: () => {
      const { past, future, map, walls } = get();
      const prev = past.at(-1);
      if (!prev || !map) return;
      set({
        past: past.slice(0, -1),
        future: [...future, { map: cloneMap(map), walls: walls.slice() }],
        map: prev.map,
        walls: prev.walls,
        rev: get().rev + 1,
        dirty: null,
        unsaved: true,
        selection: null,
      });
    },

    redo: () => {
      const { past, future, map, walls } = get();
      const next = future.at(-1);
      if (!next || !map) return;
      set({
        future: future.slice(0, -1),
        past: [...past, { map: cloneMap(map), walls: walls.slice() }],
        map: next.map,
        walls: next.walls,
        rev: get().rev + 1,
        dirty: null,
        unsaved: true,
        selection: null,
      });
    },

    set: (patch) => set(patch),

    paint: (cell) =>
      change((map) => {
        const { item } = get();
        const touched: number[] = [];
        item.tiles.forEach((row, dy) =>
          row.forEach((gid, dx) => {
            const p = { x: cell.x + dx, y: cell.y + dy };
            if (gid === 0 || !inside(map, p)) return;
            const i = p.y * map.width + p.x;
            map.layers[item.layer][i] = gid;
            touched.push(i);
          }),
        );
        recomputeCollision(map, touched);
        return touched;
      }),

    wall: (cell) =>
      change((map) => {
        const { walls, wallStyle } = get();
        if (!inside(map, cell)) return [];
        const i = cell.y * map.width + cell.x;
        if (walls[i] === wallStyle) return [];
        walls[i] = wallStyle;
        // Una pared no lleva muebles encima.
        map.layers.furniture[i] = 0;
        const changed = rebuildWalls(map, walls);
        recomputeCollision(map, [...changed, i]);
        return [...changed, i];
      }),

    erase: (cell) =>
      change((map) => {
        if (!inside(map, cell)) return [];
        const { walls } = get();
        const i = cell.y * map.width + cell.x;
        // Quita lo de más arriba: mueble, alfombra o pared (el suelo se queda).
        let changed: number[] = [i];
        if (map.layers.furniture[i]) map.layers.furniture[i] = 0;
        else if (map.layers['decor-below'][i]) map.layers['decor-below'][i] = 0;
        else if (walls[i]) {
          walls[i] = 0;
          changed = [...rebuildWalls(map, walls), i];
        } else if (map.layers.walls[i]) map.layers.walls[i] = 0;
        else return [];
        recomputeCollision(map, changed);
        return changed;
      }),

    setBlocked: (cell, blocked) =>
      change((map) => {
        if (!inside(map, cell)) return [];
        const i = cell.y * map.width + cell.x;
        map.collision[i] = blocked ? 1 : 0;
        return [i];
      }),

    setSpawn: (cell) => {
      const { map } = get();
      if (!map || !inside(map, cell)) return null;
      if (map.collision[cell.y * map.width + cell.x]) {
        return 'El punto de inicio tiene que estar en una casilla libre.';
      }
      get().checkpoint();
      change((m) => {
        m.spawn = { ...cell };
        return [];
      });
      return null;
    },

    addRect: (layer, rect) => {
      const { map, objectKind } = get();
      if (!map) return;
      const id = map.nextObjectId;
      const name = DEFAULT_NAMES[layer === 'objects' ? objectKind : layer];
      change((m) => {
        m.nextObjectId = id + 1;
        if (layer === 'objects') m.objects.push({ ...rect, id, name, kind: objectKind, value: '' });
        else m[layer].push({ ...rect, id, name });
        return [];
      });
      set({ selection: { layer, id }, tool: 'select' });
    },

    updateRect: (selection, patch) =>
      change((map) => {
        const list = map[selection.layer] as (MapRect & { value?: string })[];
        const rect = list.find((r) => r.id === selection.id);
        if (rect) Object.assign(rect, patch);
        return [];
      }),

    deleteSelection: () => {
      const { selection } = get();
      if (!selection) return;
      get().checkpoint();
      change((map) => {
        const list = map[selection.layer] as MapRect[];
        map[selection.layer] = list.filter((r) => r.id !== selection.id) as never;
        return [];
      });
      set({ selection: null });
    },

    markSaved: (rev) => {
      if (get().rev === rev) set({ unsaved: false });
    },
  };
});

/** Qué falta para poder guardar o publicar (null si el mapa se puede usar). */
export const problemOf = (map: EditableMap) => checkPlayable(map);
