import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Db } from '@pixels/db';
import type { ApiHealth } from '@pixels/shared';
import { createAuth, type AuthOptions } from './auth.js';
import { registerAuthRoutes } from './auth-routes.js';
import type { PublishSpaceEvent } from './events.js';
import type { HealthChecks } from './health.js';
import { registerEditorRoutes } from './editor.js';
import { registerJoinRoutes } from './join.js';
import { registerInviteRoutes, registerPublicInviteRoutes } from './invites.js';
import { registerMeRoutes } from './me.js';
import { registerMediaRoutes, type MediaOptions } from './media.js';
import { authenticated } from './session.js';
import { registerSpaceRoutes } from './spaces.js';

export interface AppOptions {
  corsOrigin: string;
  healthChecks: HealthChecks;
  media: MediaOptions;
  db: Db;
  auth: AuthOptions;
  /** Avisa al servidor de juego de expulsiones y espacios borrados. */
  publish: PublishSpaceEvent;
  logger?: boolean;
  /**
   * Peticiones por minuto y por IP (en toda la API). Algunas rutas tienen su propio límite. null lo
   * apaga (pruebas que no tratan de esto).
   */
  rateLimitPerMinute?: number | null;
  /**
   * Si la API va detrás de un proxy (Caddy en producción), de quién fiarse para saber la IP real
   * (cabecera X-Forwarded-For). Sin proxy, false: así nadie puede inventarse su IP.
   */
  trustProxy?: boolean | string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp({
  corsOrigin,
  healthChecks,
  media,
  db,
  auth: authOptions,
  publish,
  logger = false,
  rateLimitPerMinute = 600,
  trustProxy = false,
}: AppOptions) {
  const app = Fastify({ logger, trustProxy });
  const auth = createAuth(db, authOptions);

  // Límite de peticiones por IP: frena abusos y bucles de un cliente roto. El login tiene el suyo
  // (Better Auth) y algunas rutas, uno más estricto (config.rateLimit en cada ruta).
  if (rateLimitPerMinute !== null) {
    await app.register(rateLimit, {
      max: rateLimitPerMinute,
      timeWindow: 60_000,
      errorResponseBuilder: (_req, context) => ({
        statusCode: context.statusCode,
        error: 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
      }),
    });
  }

  // La sesión va en una cookie: el navegador la envía solo con `credentials: 'include'`.
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true,
    // @fastify/cors solo permite GET, HEAD y POST si no se indica.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

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
  registerPublicInviteRoutes(app, db);
  authenticated(app, auth, (scope) => {
    registerMeRoutes(scope, db);
    registerSpaceRoutes(scope, db, publish);
    registerEditorRoutes(scope, db, publish);
    registerJoinRoutes(scope, db, {
      ticketSecret: media.ticketSecret,
      ...(media.now ? { now: media.now } : {}),
    });
    registerInviteRoutes(scope, db);
  });

  return app;
}
