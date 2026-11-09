import { afterAll, describe, expect, it } from 'vitest';
import { productionProblems } from './config.js';
import { createTestApp, useCleanDatabase } from './test-config.js';

useCleanDatabase();

describe('límite de peticiones', () => {
  const pending = createTestApp({ rateLimitPerMinute: 3 });
  afterAll(async () => (await pending).app.close());

  it('pasado el límite por IP responde 429 con un mensaje claro', async () => {
    const { app } = await pending;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await app.inject({ url: '/health' })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const res = await app.inject({ url: '/health' });
    expect(res.json<{ error: string }>().error).toMatch(/Demasiadas peticiones/);
    // Otra IP tiene su propio límite.
    expect((await app.inject({ url: '/health', remoteAddress: '10.0.0.2' })).statusCode).toBe(200);
  });
});

describe('detrás de un proxy', () => {
  it('sin TRUST_PROXY no se cree la IP que diga el cliente', async () => {
    const { app } = await createTestApp({ rateLimitPerMinute: 1 });
    const spoof = (ip: string) =>
      app.inject({ url: '/health', headers: { 'x-forwarded-for': ip } });
    expect((await spoof('1.1.1.1')).statusCode).toBe(200);
    // Cambiar la cabecera no sirve para saltarse el límite.
    expect((await spoof('2.2.2.2')).statusCode).toBe(429);
    await app.close();
  });

  it('con TRUST_PROXY se usa la IP real que pasa el proxy', async () => {
    const { app } = await createTestApp({ rateLimitPerMinute: 1, trustProxy: '127.0.0.1' });
    const from = (ip: string) => app.inject({ url: '/health', headers: { 'x-forwarded-for': ip } });
    expect((await from('1.1.1.1')).statusCode).toBe(200);
    expect((await from('2.2.2.2')).statusCode).toBe(200);
    expect((await from('1.1.1.1')).statusCode).toBe(429);
    await app.close();
  });
});

describe('configuración de producción', () => {
  const good = {
    DATABASE_URL: 'postgresql://pixels:x@postgres:5432/pixels',
    REDIS_URL: 'redis://redis:6379',
    LIVEKIT_URL: 'ws://livekit:7880',
    LIVEKIT_PUBLIC_URL: 'wss://rtc.pixels.example',
    LIVEKIT_API_KEY: 'APIk3y',
    LIVEKIT_API_SECRET: 'Zq8vR2mN5tW9yB4cF7hJ1kL3pS6uX0aD',
    TICKET_SECRET: 'Hn4Gq7Lp2Vx9Rt5Kw8Mz3Bc6Jf1Ys0Ud',
    BETTER_AUTH_SECRET: 'Pw6Ty1Nq4Zc8Hv3Lm7Rx2Gd5Kb9Js0Fa',
    API_PUBLIC_URL: 'https://pixels.example',
    CORS_ORIGIN: 'https://pixels.example',
    SMTP_URL: 'smtps://user:pass@smtp.postmarkapp.com:465',
    MAIL_FROM: 'pixels <hola@pixels.example>',
  };

  it('acepta una configuración completa', () => {
    expect(productionProblems(good, true)).toEqual([]);
  });

  it('rechaza valores de desarrollo, secretos cortos y direcciones sin HTTPS', () => {
    const problems = productionProblems(
      {
        ...good,
        TICKET_SECRET: 'dev-ticket-secret',
        LIVEKIT_API_KEY: 'devkey',
        API_PUBLIC_URL: 'http://pixels.example',
        LIVEKIT_PUBLIC_URL: 'ws://rtc.pixels.example',
        SMTP_URL: 'smtp://localhost:1025',
        MAIL_FROM: '',
      },
      false,
    ).join('\n');
    for (const expected of [
      /TICKET_SECRET/,
      /LIVEKIT_API_KEY/,
      /API_PUBLIC_URL/,
      /LIVEKIT_PUBLIC_URL/,
      /buzón de pruebas/,
      /falta MAIL_FROM/,
      /AUTH_RATE_LIMIT/,
    ]) {
      expect(problems).toMatch(expected);
    }
  });
});
