import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@pixels/db';
import {
  INVITE_DEFAULT_DAYS,
  INVITE_MAX_DAYS,
  can,
  isInviteRole,
  type AcceptInviteResponse,
  type CreatedInvite,
  type Invite,
  type InvitePreview,
  type InviteRole,
} from '@pixels/shared';
import { forbidden, notFound, roleIn, toDbRole, toRole } from './spaces.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;

/** El enlace lleva un token aleatorio; en la base de datos solo se guarda su hash. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(24).toString('base64url');

type InviteRow = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  expiresAt: Date;
  uses: number;
  createdBy: { name: string } | null;
};

const toInvite = (row: InviteRow): Invite => ({
  id: row.id,
  role: toRole(row.role) as InviteRole,
  expiresAt: row.expiresAt.toISOString(),
  uses: row.uses,
  createdBy: row.createdBy?.name ?? null,
});

/** Invitación vigente (sin revocar ni caducar) a partir del token del enlace. */
async function findActiveInvite(db: Db, token: string, now: Date) {
  if (!TOKEN_FORMAT.test(token)) return null;
  return db.invite.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: now } },
    include: { space: { select: { id: true, name: true } } },
  });
}

type SpaceParams = { Params: { spaceId: string } };
type TokenParams = { Params: { token: string } };

export interface InviteRouteOptions {
  now?: () => Date;
}

/** Rutas públicas: ver a qué espacio invita un enlace (sin login). */
export function registerPublicInviteRoutes(
  app: FastifyInstance,
  db: Db,
  { now = () => new Date() }: InviteRouteOptions = {},
) {
  app.get<TokenParams>('/invites/:token', async (req, reply) => {
    const invite = await findActiveInvite(db, req.params.token, now());
    if (!invite) return reply.code(404).send({ error: 'La invitación no existe o ha caducado' });
    return {
      spaceName: invite.space.name,
      role: toRole(invite.role) as InviteRole,
    } satisfies InvitePreview;
  });
}

/** Rutas con sesión: crear, listar, revocar y aceptar invitaciones. */
export function registerInviteRoutes(
  app: FastifyInstance,
  db: Db,
  { now = () => new Date() }: InviteRouteOptions = {},
) {
  app.get<SpaceParams>('/spaces/:spaceId/invites', async (req, reply) => {
    const { spaceId } = req.params;
    const role = await roleIn(db, spaceId, req.user.id);
    if (!role) return notFound(reply);
    if (!can.manageInvites(role)) return forbidden(reply);
    const invites = await db.invite.findMany({
      where: { spaceId, revokedAt: null, expiresAt: { gt: now() } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(toInvite);
  });

  app.post<SpaceParams>('/spaces/:spaceId/invites', async (req, reply) => {
    const { spaceId } = req.params;
    const role = await roleIn(db, spaceId, req.user.id);
    if (!role) return notFound(reply);
    if (!can.manageInvites(role)) return forbidden(reply);

    const body = (req.body ?? {}) as { role?: unknown; days?: unknown };
    if (!isInviteRole(body.role)) return reply.code(400).send({ error: 'Rol no válido' });
    const days = body.days ?? INVITE_DEFAULT_DAYS;
    if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > INVITE_MAX_DAYS) {
      return reply.code(400).send({ error: `La invitación dura de 1 a ${INVITE_MAX_DAYS} días` });
    }

    const token = newToken();
    const invite = await db.invite.create({
      data: {
        spaceId,
        tokenHash: hashToken(token),
        role: toDbRole(body.role),
        createdById: req.user.id,
        expiresAt: new Date(now().getTime() + (days as number) * DAY_MS),
      },
      include: { createdBy: { select: { name: true } } },
    });
    return reply.code(201).send({ ...toInvite(invite), token } satisfies CreatedInvite);
  });

  app.delete<{ Params: { spaceId: string; inviteId: string } }>(
    '/spaces/:spaceId/invites/:inviteId',
    async (req, reply) => {
      const { spaceId, inviteId } = req.params;
      const role = await roleIn(db, spaceId, req.user.id);
      if (!role) return notFound(reply);
      if (!can.manageInvites(role)) return forbidden(reply);
      const { count } = await db.invite.updateMany({
        where: { id: inviteId, spaceId, revokedAt: null },
        data: { revokedAt: now() },
      });
      if (!count) return reply.code(404).send({ error: 'Invitación no encontrada' });
      return reply.code(204).send();
    },
  );

  app.post<TokenParams>('/invites/:token/accept', async (req, reply) => {
    const invite = await findActiveInvite(db, req.params.token, now());
    if (!invite) return reply.code(404).send({ error: 'La invitación no existe o ha caducado' });
    const spaceId = invite.space.id;

    // Si ya es miembro no se toca su rol (un enlace de invitado no degrada a un admin).
    // `skipDuplicates` evita el error si se acepta dos veces a la vez.
    await db.$transaction(async (tx) => {
      const { count } = await tx.membership.createMany({
        data: [{ spaceId, userId: req.user.id, role: invite.role }],
        skipDuplicates: true,
      });
      if (count) {
        await tx.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      }
    });
    return { spaceId } satisfies AcceptInviteResponse;
  });
}
