import { afterAll, describe, expect, it } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import type { MediaTokenResponse } from '@pixels/shared';
import { signMediaTicket } from '@pixels/shared/tickets';
import { createTestApp, testDb } from './test-config.js';

const { app } = await createTestApp();
afterAll(async () => {
  await app.close();
  await testDb().$disconnect();
});

const ticket = (overrides: Partial<{ sid: string; exp: number }> = {}, secret = 'ticket-secret') =>
  signMediaTicket(
    { sid: 'sess-1', room: 'world-r1', name: 'Alice', exp: 2_000, ...overrides },
    secret,
  );

const postToken = (payload: unknown) =>
  app.inject({ method: 'POST', url: '/media/token', payload: payload as object });

describe('POST /media/token', () => {
  it('canjea un ticket válido por un token de LiveKit con la identidad del jugador', async () => {
    const res = await postToken({ ticket: ticket() });
    expect(res.statusCode).toBe(200);
    const body = res.json<MediaTokenResponse>();
    expect(body.url).toBe('ws://livekit.test');

    const claims = await new TokenVerifier(
      'test-key',
      'test-secret-that-is-long-enough-123',
    ).verify(body.token);
    expect(claims.sub).toBe('sess-1');
    expect(claims.name).toBe('Alice');
    expect(claims.video).toMatchObject({
      room: 'world-r1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    // Sin permisos de administración de la sala.
    expect(claims.video?.roomAdmin).toBeFalsy();
  });

  it('rechaza un ticket caducado', async () => {
    expect((await postToken({ ticket: ticket({ exp: 1_000 }) })).statusCode).toBe(401);
  });

  it('rechaza un ticket firmado con otro secreto', async () => {
    expect((await postToken({ ticket: ticket({}, 'otro') })).statusCode).toBe(401);
  });

  it('rechaza peticiones sin ticket', async () => {
    expect((await postToken({})).statusCode).toBe(400);
  });

  it('nunca devuelve las claves de LiveKit', async () => {
    const res = await postToken({ ticket: ticket() });
    expect(res.body).not.toContain('test-secret-that-is-long-enough-123');
  });
});
