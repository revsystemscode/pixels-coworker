import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { ApiHealth } from '@pixels/shared';
import type { HealthChecks } from './health.js';
import { registerMediaRoutes, type MediaOptions } from './media.js';

export interface AppOptions {
  corsOrigin: string;
  healthChecks: HealthChecks;
  media: MediaOptions;
  logger?: boolean;
}

export async function buildApp({ corsOrigin, healthChecks, media, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  await app.register(cors, { origin: corsOrigin });

  app.get('/health', async (): Promise<ApiHealth> => {
    const [postgres, redis, livekit] = await Promise.all([
      healthChecks.postgres(),
      healthChecks.redis(),
      healthChecks.livekit(),
    ]);
    // La API en sí está viva aunque alguna dependencia no lo esté.
    return { service: 'api', status: 'up', dependencies: { postgres, redis, livekit } };
  });

  registerMediaRoutes(app, media);

  return app;
}
