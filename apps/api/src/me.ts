import type { FastifyInstance } from 'fastify';
import type { Db } from '@pixels/db';
import { parseProfile, type Me } from '@pixels/shared';

/** GET /me y PATCH /me: el perfil (nombre y avatar) de quien tiene la sesión. */
export function registerMeRoutes(app: FastifyInstance, db: Db) {
  app.get('/me', async (req): Promise<Me> => req.user);

  app.patch('/me', async (req, reply) => {
    const profile = parseProfile(req.body);
    if (!profile) return reply.code(400).send({ error: 'Elige un nombre y un avatar válidos' });
    const user = await db.user.update({
      where: { id: req.user.id },
      data: profile,
      select: { id: true, email: true, name: true, avatar: true },
    });
    return user satisfies Me;
  });
}
