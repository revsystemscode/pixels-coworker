import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { ApiHealth } from '@pixels/shared';
import type { HealthChecks } from './health.js';

export interface AppOptions {
  corsOrigin: string;
  healthChecks: HealthChecks;
  logger?: boolean;
}

export async function buildApp({ corsOrigin, healthChecks, logger = false }: AppOptions) {
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

  return app;
}
