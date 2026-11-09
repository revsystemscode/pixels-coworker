import { afterAll, describe, expect, it, vi } from 'vitest';
import { parseDsn } from './monitoring.js';
import { createTestApp, useCleanDatabase } from './test-config.js';

useCleanDatabase();
const DSN = 'https://abc123@o42.ingest.de.sentry.io/4507';
const t = await createTestApp({ monitoring: { webDsn: DSN } });
afterAll(() => t.app.close());

const envelope = (dsn: string) => `${JSON.stringify({ dsn })}\n{"type":"event"}\n{}`;

describe('túnel de Sentry para la web', () => {
  it('reenvía a Sentry solo los informes del proyecto configurado', async () => {
    const forwarded: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      forwarded.push(String(url));
      return new Response(null, { status: 200 });
    });
    const send = (body: string) =>
      t.app.inject({
        method: 'POST',
        url: '/monitoring',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        payload: body,
      });

    expect((await send(envelope(DSN))).statusCode).toBe(200);
    expect(forwarded).toEqual(['https://o42.ingest.de.sentry.io/api/4507/envelope/']);
    // Otro proyecto (o cualquier otra cosa): no se reenvía.
    expect((await send(envelope('https://x@evil.example/1'))).statusCode).toBe(403);
    expect((await send('no es un sobre')).statusCode).toBe(400);
    expect(forwarded).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('sin DSN configurado no hay túnel', async () => {
    const other = await createTestApp();
    const res = await other.app.inject({ method: 'POST', url: '/monitoring', payload: 'x' });
    expect(res.statusCode).toBe(404);
    await other.app.close();
  });

  it('entiende los DSN de Sentry', () => {
    expect(parseDsn(DSN)).toEqual({ url: 'https://o42.ingest.de.sentry.io/api/4507/envelope/' });
    expect(parseDsn('http://k@host/1')).toBeNull();
    expect(parseDsn('https://k@host/abc')).toBeNull();
  });
});

describe('/health/ready', () => {
  it('503 si alguna dependencia está caída; 200 si todo está bien', async () => {
    expect((await t.app.inject({ url: '/health/ready' })).statusCode).toBe(200);
    const down = await createTestApp({
      healthChecks: {
        postgres: async () => 'up',
        redis: async () => 'down',
        livekit: async () => 'up',
      },
    });
    const res = await down.app.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ dependencies: { redis: 'down' }, version: 'dev' });
    await down.app.close();
  });
});
