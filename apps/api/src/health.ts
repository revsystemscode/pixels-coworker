import { Redis } from 'ioredis';
import pg from 'pg';
import type { ServiceStatus } from '@pixels/shared';
import type { Config } from './config.js';

export type HealthCheck = () => Promise<ServiceStatus>;

export interface HealthChecks {
  postgres: HealthCheck;
  redis: HealthCheck;
  livekit: HealthCheck;
}

const TIMEOUT_MS = 2000;

async function toStatus(probe: () => Promise<unknown>): Promise<ServiceStatus> {
  try {
    await probe();
    return 'up';
  } catch {
    return 'down';
  }
}

export function createHealthChecks(config: Config): HealthChecks {
  return {
    postgres: () =>
      toStatus(async () => {
        const client = new pg.Client({
          connectionString: config.databaseUrl,
          connectionTimeoutMillis: TIMEOUT_MS,
        });
        try {
          await client.connect();
          await client.query('SELECT 1');
        } finally {
          await client.end().catch(() => {});
        }
      }),

    redis: () =>
      toStatus(async () => {
        const redis = new Redis(config.redisUrl, {
          lazyConnect: true,
          connectTimeout: TIMEOUT_MS,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        });
        try {
          await redis.connect();
          await redis.ping();
        } finally {
          redis.disconnect();
        }
      }),

    // LiveKit responde "OK" en la raíz HTTP del mismo puerto que la señalización.
    livekit: () =>
      toStatus(async () => {
        const url = config.livekitUrl.replace(/^ws/, 'http');
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`LiveKit respondió ${res.status}`);
      }),
  };
}
