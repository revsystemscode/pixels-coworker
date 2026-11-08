import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { Db } from '@pixels/db';
import type { ApiHealth } from '@pixels/shared';
import { createAuth, type AuthOptions } from './auth.js';
import { registerAuthRoutes } from './auth-routes.js';
import type { HealthChecks } from './health.js';
import { registerMeRoutes } from './me.js';
import { registerMediaRoutes, type MediaOptions } from './media.js';
import { authenticated } from './session.js';

export interface AppOptions {
  corsOrigin: string;
  healthChecks: HealthChecks;
  media: MediaOptions;
  db: Db;
  auth: AuthOptions;
  logger?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp({
  corsOrigin,
  healthChecks,
  media,
  db,
  auth: authOptions,
  logger = false,
}: AppOptions) {
  const app = Fastify({ logger });
  const auth = createAuth(db, authOptions);

  // La sesión va en una cookie: el navegador la envía solo con `credentials: 'include'`.
  await app.register(cors, { origin: corsOrigin, credentials: true });

  // Contra CSRF: las peticiones que cambian algo solo se aceptan desde la web.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && origin !== corsOrigin) {
      return reply.code(403).send({ error: 'Origen no permitido' });
    }
  });

  app.get('/health', async (): Promise<ApiHealth> => {
    const [postgres, redis, livekit] = await Promise.all([
      healthChecks.postgres(),
      healthChecks.redis(),
      healthChecks.livekit(),
    ]);
    // La API en sí está viva aunque alguna dependencia no lo esté.
    return { service: 'api', status: 'up', dependencies: { postgres, redis, livekit } };
  });

  registerAuthRoutes(app, auth, { baseURL: authOptions.baseURL, google: !!authOptions.google });
  registerMediaRoutes(app, media);
  authenticated(app, auth, (scope) => {
    registerMeRoutes(scope, db);
  });

  return app;
}
