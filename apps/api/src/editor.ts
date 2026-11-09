import type { FastifyInstance } from 'fastify';
import type { Db } from '@pixels/db';
import {
  can,
  parseTiledForEditing,
  toTiled,
  type MapEditorResponse,
  type PublishMapResponse,
  type SaveDraftResponse,
  type TiledMap,
} from '@pixels/shared';
import type { PublishSpaceEvent } from './events.js';
import { forbidden, notFound, roleIn } from './spaces.js';

type SpaceParams = { Params: { spaceId: string } };

/** Un mapa de 100×100 con todas sus capas ronda los 300 KB en JSON. */
const MAP_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * Editor de mapas (dueño y admins). Se edita un borrador, que se guarda aparte; al publicarlo pasa a
 * ser el mapa del espacio y el servidor de juego lo carga en caliente (aviso por Redis).
 */
export function registerEditorRoutes(app: FastifyInstance, db: Db, publish: PublishSpaceEvent) {
  /** Comprueba el permiso: devuelve false (y ya respondió) si no puede editar. */
  async function allowed(spaceId: string, userId: string, reply: Parameters<typeof notFound>[0]) {
    const role = await roleIn(db, spaceId, userId);
    if (!role) {
      await notFound(reply);
      return false;
    }
    if (!can.editMap(role)) {
      await forbidden(reply);
      return false;
    }
    return true;
  }

  app.get<SpaceParams>('/spaces/:spaceId/editor', async (req, reply) => {
    const { spaceId } = req.params;
    if (!(await allowed(spaceId, req.user.id, reply))) return reply;
    const space = await db.space.findUniqueOrThrow({
      where: { id: spaceId },
      select: { map: { select: { data: true, updatedAt: true } }, mapDraft: true },
    });
    reply.header('cache-control', 'private, no-store');
    return {
      published: space.map.data as unknown as TiledMap,
      publishedAt: space.map.updatedAt.toISOString(),
      draft: (space.mapDraft?.data as unknown as TiledMap | undefined) ?? null,
      draftUpdatedAt: space.mapDraft?.updatedAt.toISOString() ?? null,
    } satisfies MapEditorResponse;
  });

  app.put<SpaceParams>(
    '/spaces/:spaceId/editor/draft',
    // El editor guarda solo, como mucho cada segundo y medio.
    { bodyLimit: MAP_BODY_LIMIT, config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (req, reply) => {
      const { spaceId } = req.params;
      if (!(await allowed(spaceId, req.user.id, reply))) return reply;
      const parsed = parseTiledForEditing((req.body as { map?: unknown } | null)?.map);
      if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
      // Se guarda normalizado: solo lo que el juego usa, en el formato de la plantilla.
      const data = toTiled(parsed.map) as unknown as object;
      const draft = await db.mapDraft.upsert({
        where: { spaceId },
        create: { spaceId, data, updatedById: req.user.id },
        update: { data, updatedById: req.user.id },
      });
      return { draftUpdatedAt: draft.updatedAt.toISOString() } satisfies SaveDraftResponse;
    },
  );

  app.delete<SpaceParams>('/spaces/:spaceId/editor/draft', async (req, reply) => {
    const { spaceId } = req.params;
    if (!(await allowed(spaceId, req.user.id, reply))) return reply;
    await db.mapDraft.deleteMany({ where: { spaceId } });
    return reply.code(204).send();
  });

  app.post<SpaceParams>(
    '/spaces/:spaceId/editor/publish',
    { config: { rateLimit: { max: 10, timeWindow: 60_000 } } },
    async (req, reply) => {
      const { spaceId } = req.params;
      if (!(await allowed(spaceId, req.user.id, reply))) return reply;
      const space = await db.space.findUniqueOrThrow({
        where: { id: spaceId },
        select: { mapId: true, mapDraft: true },
      });
      if (!space.mapDraft) return reply.code(409).send({ error: 'No hay cambios que publicar.' });
      // Se vuelve a validar por si las reglas cambiaron desde que se guardó.
      const parsed = parseTiledForEditing(space.mapDraft.data);
      if (!parsed.ok) return reply.code(400).send({ error: parsed.error });

      const boards = parsed.map.whiteboards.map((b) => `board-${b.id}`);
      const objects = parsed.map.objects.map((o) => `obj-${o.id}`);
      const [map] = await db.$transaction([
        db.map.update({
          where: { id: space.mapId },
          data: { data: toTiled(parsed.map) as unknown as object },
        }),
        db.mapDraft.delete({ where: { spaceId } }),
        // Lo dibujado o escrito en pizarras y objetos que ya no están en el mapa se borra.
        db.whiteboard.deleteMany({ where: { spaceId, boardId: { notIn: boards } } }),
        db.spaceObject.deleteMany({ where: { spaceId, objectId: { notIn: objects } } }),
      ]);
      publish({ type: 'map-updated', spaceId });
      return { mapVersion: map.updatedAt.toISOString() } satisfies PublishMapResponse;
    },
  );
}
