import type { Db } from '@pixels/db';
import { isDirection, type Direction, type TiledMap } from '@pixels/shared';

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
  };
}

/** Almacén en memoria (pruebas y bots de carga). */
export class MemorySpaceStore implements SpaceStore {
  readonly maps = new Map<string, TiledMap>();
  readonly positions = new Map<string, SavedPosition>();

  async loadMap(spaceId: string) {
    return this.maps.get(spaceId) ?? null;
  }
  async loadPosition(spaceId: string, userId: string) {
    return this.positions.get(`${spaceId}/${userId}`) ?? null;
  }
  async savePosition(spaceId: string, userId: string, position: SavedPosition) {
    this.positions.set(`${spaceId}/${userId}`, position);
  }
}
