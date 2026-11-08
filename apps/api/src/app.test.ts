import { describe, expect, it } from 'vitest';
import type { ApiHealth } from '@pixels/shared';
import { buildApp } from './app.js';
import { testMedia } from './test-config.js';

describe('GET /health', () => {
  it('informa el estado de cada dependencia', async () => {
    const app = await buildApp({
      corsOrigin: 'http://localhost:5173',
      healthChecks: {
        postgres: async () => 'up',
        redis: async () => 'down',
        livekit: async () => 'up',
      },
      media: testMedia,
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json<ApiHealth>()).toEqual({
      service: 'api',
      status: 'up',
      dependencies: { postgres: 'up', redis: 'down', livekit: 'up' },
    });
    await app.close();
  });

  it('permite CORS desde el frontend', async () => {
    const app = await buildApp({
      corsOrigin: 'http://localhost:5173',
      healthChecks: {
        postgres: async () => 'up',
        redis: async () => 'up',
        livekit: async () => 'up',
      },
      media: testMedia,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await app.close();
  });
});
