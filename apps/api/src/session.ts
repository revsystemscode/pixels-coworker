import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from './auth.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatar: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario con sesión. Solo existe en las rutas registradas con `authenticated`. */
    user: SessionUser;
  }
}

export function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const v of value) result.append(key, v);
    else if (value !== undefined) result.set(key, value);
  }
  return result;
}

export async function getSessionUser(auth: Auth, req: FastifyRequest): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: toWebHeaders(req.headers) });
  if (!session) return null;
  const { id, email, name, avatar } = session.user;
  return { id, email, name, avatar: typeof avatar === 'number' ? avatar : 0 };
}

/**
 * Registra rutas que exigen sesión. Dentro, `req.user` siempre existe; sin sesión se responde 401.
 */
export function authenticated(
  app: FastifyInstance,
  auth: Auth,
  routes: (app: FastifyInstance) => void,
) {
  void app.register(async (scope) => {
    scope.decorateRequest('user', null as unknown as SessionUser);
    scope.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      const user = await getSessionUser(auth, req);
      if (!user) return reply.code(401).send({ error: 'Inicia sesión para continuar' });
      req.user = user;
    });
    routes(scope);
  });
}
