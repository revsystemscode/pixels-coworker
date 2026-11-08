import type { Db } from '@pixels/db';
import { isDirection, type BoardElement, type Direction, type TiledMap } from '@pixels/shared';

export interface SavedPosition {
  x: number;
  y: number;
  dir: Direction;
}

/** Lo que la sala necesita de la base de datos. Las pruebas usan `MemorySpaceStore`. */
export interface SpaceStore {
  /** Mapa del espacio, o null si el espacio no existe. */
  loadMap(spaceId: string): Promise<TiledMap | null>;
  loadPosition(spaceId: string, userId: string): Promise<SavedPosition | null>;
  /** Guarda la última posición. No hace nada si la persona ya no es miembro. */
  savePosition(spaceId: string, userId: string, position: SavedPosition): Promise<void>;
  /** Elementos guardados de una pizarra ([] si aún no se ha dibujado nada). */
  loadBoard(spaceId: string, boardId: string): Promise<unknown[]>;
  saveBoard(spaceId: string, boardId: string, elements: BoardElement[]): Promise<void>;
}

export function createDbSpaceStore(db: Db): SpaceStore {
  return {
    async loadMap(spaceId) {
      const space = await db.space.findUnique({
        where: { id: spaceId },
        select: { map: { select: { data: true } } },
      });
      return space ? (space.map.data as unknown as TiledMap) : null;
    },
    async loadPosition(spaceId, userId) {
      const m = await db.membership.findUnique({
        where: { spaceId_userId: { spaceId, userId } },
        select: { lastX: true, lastY: true, lastDir: true },
      });
      if (m?.lastX == null || m.lastY == null) return null;
      return { x: m.lastX, y: m.lastY, dir: isDirection(m.lastDir) ? m.lastDir : 'down' };
    },
    async savePosition(spaceId, userId, { x, y, dir }) {
      await db.membership.updateMany({
        where: { spaceId, userId },
        data: { lastX: x, lastY: y, lastDir: dir },
      });
    },
    async loadBoard(spaceId, boardId) {
      const board = await db.whiteboard.findUnique({
        where: { spaceId_boardId: { spaceId, boardId } },
        select: { elements: true },
      });
      return Array.isArray(board?.elements) ? board.elements : [];
    },
    async saveBoard(spaceId, boardId, elements) {
      const data = elements as unknown as object[];
      await db.whiteboard.upsert({
        where: { spaceId_boardId: { spaceId, boardId } },
        create: { spaceId, boardId, elements: data },
        update: { elements: data },
      });
    },
  };
}

/** Almacén en memoria (pruebas y bots de carga). */
export class MemorySpaceStore implements SpaceStore {
  readonly maps = new Map<string, TiledMap>();
  readonly positions = new Map<string, SavedPosition>();
  readonly boards = new Map<string, BoardElement[]>();

  async loadMap(spaceId: string) {
    return this.maps.get(spaceId) ?? null;
  }
  async loadPosition(spaceId: string, userId: string) {
    return this.positions.get(`${spaceId}/${userId}`) ?? null;
  }
  async savePosition(spaceId: string, userId: string, position: SavedPosition) {
    this.positions.set(`${spaceId}/${userId}`, position);
  }
  async loadBoard(spaceId: string, boardId: string): Promise<unknown[]> {
    return structuredClone(this.boards.get(`${spaceId}/${boardId}`) ?? []);
  }
  async saveBoard(spaceId: string, boardId: string, elements: BoardElement[]) {
    this.boards.set(`${spaceId}/${boardId}`, structuredClone(elements));
  }
}
