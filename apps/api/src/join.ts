import type { FastifyInstance } from 'fastify';
import type { Db } from '@pixels/db';
import { JOIN_TICKET_TTL_MS, type JoinSpaceResponse } from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { notFound, toRole } from './spaces.js';

export interface JoinOptions {
  /** Secreto compartido con el servidor de juego. */
  ticketSecret: string;
  now?: () => number;
}

type SpaceParams = { Params: { spaceId: string } };

/**
 * POST /spaces/:id/join → ticket para entrar a la sala del espacio, con la identidad, el nombre, el
 * avatar y el rol. El servidor de juego no deja entrar sin él. GET /spaces/:id/map → el mapa.
 */
export function registerJoinRoutes(app: FastifyInstance, db: Db, options: JoinOptions) {
  const now = options.now ?? Date.now;

  app.post<SpaceParams>('/spaces/:spaceId/join', async (req, reply) => {
    const { spaceId } = req.params;
    const membership = await db.membership.findUnique({
      where: { spaceId_userId: { spaceId, userId: req.user.id } },
      include: { space: { select: { name: true, map: { select: { updatedAt: true } } } } },
    });
    if (!membership) return notFound(reply);
    if (!req.user.name) return reply.code(409).send({ error: 'Elige tu nombre antes de entrar' });

    const role = toRole(membership.role);
    const ticket = signJoinTicket(
      {
        uid: req.user.id,
        space: spaceId,
        name: req.user.name,
        avatar: req.user.avatar,
        role,
        exp: now() + JOIN_TICKET_TTL_MS,
      },
      options.ticketSecret,
    );
    return {
      ticket,
      space: { id: spaceId, name: membership.space.name, role },
      mapVersion: membership.space.map.updatedAt.toISOString(),
    } satisfies JoinSpaceResponse;
  });

  app.get<SpaceParams>('/spaces/:spaceId/map', async (req, reply) => {
    const membership = await db.membership.findUnique({
      where: { spaceId_userId: { spaceId: req.params.spaceId, userId: req.user.id } },
      include: { space: { select: { map: { select: { data: true } } } } },
    });
    if (!membership) return notFound(reply);
    reply.header('cache-control', 'private, no-cache');
    return membership.space.map.data;
  });
}
