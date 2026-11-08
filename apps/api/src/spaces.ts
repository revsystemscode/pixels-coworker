import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Db, Role as DbRole } from '@pixels/db';
import {
  DEFAULT_MAP,
  MAPS,
  MAX_OWNED_SPACES,
  can,
  canChangeRole,
  canRemoveMember,
  isRole,
  parseSpaceName,
  type Member,
  type Role,
  type SpaceSummary,
} from '@pixels/shared';

export const toRole = (role: DbRole) => role.toLowerCase() as Role;
export const toDbRole = (role: Role) => role.toUpperCase() as DbRole;

/** Rol de la persona en el espacio, o null si no es miembro (o el espacio no existe). */
export async function roleIn(db: Db, spaceId: string, userId: string): Promise<Role | null> {
  const membership = await db.membership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { role: true },
  });
  return membership ? toRole(membership.role) : null;
}

/** A quien no es miembro se le responde 404: no se revela si el espacio existe. */
export const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ error: 'Espacio no encontrado' });
export const forbidden = (reply: FastifyReply) =>
  reply.code(403).send({ error: 'No tienes permiso para hacer esto' });

type SpaceParams = { Params: { spaceId: string } };
type MemberParams = { Params: { spaceId: string; userId: string } };

/** Espacios, miembros y roles. Todas las rutas exigen sesión. */
export function registerSpaceRoutes(app: FastifyInstance, db: Db) {
  app.get('/spaces', async (req): Promise<SpaceSummary[]> => {
    const memberships = await db.membership.findMany({
      where: { userId: req.user.id },
      include: { space: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((m) => ({ id: m.spaceId, name: m.space.name, role: toRole(m.role) }));
  });

  app.post('/spaces', async (req, reply) => {
    const name = parseSpaceName((req.body as { name?: unknown } | null)?.name);
    if (!name) return reply.code(400).send({ error: 'Ponle un nombre al espacio' });

    const owned = await db.membership.count({ where: { userId: req.user.id, role: 'OWNER' } });
    if (owned >= MAX_OWNED_SPACES) {
      return reply
        .code(409)
        .send({ error: `Ya tienes ${MAX_OWNED_SPACES} espacios. Borra alguno para crear otro.` });
    }

    // Cada espacio tiene su propia copia del mapa (para poder editarlo en el futuro).
    const space = await db.space.create({
      data: {
        name,
        map: {
          create: { name: 'Oficina', template: DEFAULT_MAP, data: MAPS[DEFAULT_MAP] as object },
        },
        memberships: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });
    return reply
      .code(201)
      .send({ id: space.id, name: space.name, role: 'owner' } satisfies SpaceSummary);
  });

  app.get<SpaceParams>('/spaces/:spaceId', async (req, reply) => {
    const membership = await db.membership.findUnique({
      where: { spaceId_userId: { spaceId: req.params.spaceId, userId: req.user.id } },
      include: { space: { select: { name: true } } },
    });
    if (!membership) return notFound(reply);
    return {
      id: membership.spaceId,
      name: membership.space.name,
      role: toRole(membership.role),
    } satisfies SpaceSummary;
  });

  app.patch<SpaceParams>('/spaces/:spaceId', async (req, reply) => {
    const { spaceId } = req.params;
    const role = await roleIn(db, spaceId, req.user.id);
    if (!role) return notFound(reply);
    if (!can.renameSpace(role)) return forbidden(reply);
    const name = parseSpaceName((req.body as { name?: unknown } | null)?.name);
    if (!name) return reply.code(400).send({ error: 'Ponle un nombre al espacio' });
    const space = await db.space.update({ where: { id: spaceId }, data: { name } });
    return { id: space.id, name: space.name, role } satisfies SpaceSummary;
  });

  app.delete<SpaceParams>('/spaces/:spaceId', async (req, reply) => {
    const { spaceId } = req.params;
    const role = await roleIn(db, spaceId, req.user.id);
    if (!role) return notFound(reply);
    if (!can.deleteSpace(role)) return forbidden(reply);
    await db.$transaction(async (tx) => {
      const space = await tx.space.delete({ where: { id: spaceId } });
      await tx.map.delete({ where: { id: space.mapId } });
    });
    return reply.code(204).send();
  });

  app.get<SpaceParams>('/spaces/:spaceId/members', async (req, reply) => {
    const { spaceId } = req.params;
    const role = await roleIn(db, spaceId, req.user.id);
    if (!role) return notFound(reply);
    if (!can.viewMembers(role)) return forbidden(reply);
    const showEmail = can.manageInvites(role);
    const memberships = await db.membership.findMany({
      where: { spaceId },
      include: { user: { select: { name: true, email: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m): Member => ({
      userId: m.userId,
      name: m.user.name,
      email: showEmail ? m.user.email : null,
      avatar: m.user.avatar,
      role: toRole(m.role),
    }));
  });

  app.patch<MemberParams>('/spaces/:spaceId/members/:userId', async (req, reply) => {
    const { spaceId, userId } = req.params;
    const actor = await roleIn(db, spaceId, req.user.id);
    if (!actor) return notFound(reply);
    const next = (req.body as { role?: unknown } | null)?.role;
    if (!isRole(next)) return reply.code(400).send({ error: 'Rol no válido' });
    const target = await roleIn(db, spaceId, userId);
    if (!target) return reply.code(404).send({ error: 'Esa persona no es miembro' });
    if (userId === req.user.id || !canChangeRole(actor, target, next)) return forbidden(reply);
    await db.membership.update({
      where: { spaceId_userId: { spaceId, userId } },
      data: { role: toDbRole(next) },
    });
    return { userId, role: next };
  });

  app.delete<MemberParams>('/spaces/:spaceId/members/:userId', async (req, reply) => {
    const { spaceId, userId } = req.params;
    const actor = await roleIn(db, spaceId, req.user.id);
    if (!actor) return notFound(reply);
    const target = await roleIn(db, spaceId, userId);
    if (!target) return reply.code(404).send({ error: 'Esa persona no es miembro' });
    if (!canRemoveMember(actor, target, userId === req.user.id)) return forbidden(reply);
    await db.membership.delete({ where: { spaceId_userId: { spaceId, userId } } });
    return reply.code(204).send();
  });
}
