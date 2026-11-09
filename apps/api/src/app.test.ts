import { describe, expect, it } from 'vitest';
import type { ApiHealth } from '@pixels/shared';
import { createTestApp } from './test-config.js';

describe('GET /health', () => {
  it('informa el estado de cada dependencia', async () => {
    const { app } = await createTestApp({
      healthChecks: {
        postgres: async () => 'up',
        redis: async () => 'down',
        livekit: async () => 'up',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json<ApiHealth>()).toEqual({
      service: 'api',
      status: 'up',
      dependencies: { postgres: 'up', redis: 'down', livekit: 'up' },
      version: 'dev',
    });
    await app.close();
  });

  it('permite CORS desde el frontend', async () => {
    const { app } = await createTestApp({
      healthChecks: {
        postgres: async () => 'up',
        redis: async () => 'up',
        livekit: async () => 'up',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await app.close();
  });

  it('permite PATCH y DELETE con cookies desde el frontend (preflight)', async () => {
    const { app } = await createTestApp();
    for (const method of ['PATCH', 'DELETE']) {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/me',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type',
        },
      });
      expect(res.headers['access-control-allow-methods']).toContain(method);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
    await app.close();
  });
});
