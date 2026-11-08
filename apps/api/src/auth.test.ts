import { afterAll, describe, expect, it } from 'vitest';
import type { Me } from '@pixels/shared';
import { WEB_ORIGIN, createTestApp, signIn, useCleanDatabase } from './test-config.js';

useCleanDatabase();
const t = await createTestApp();
afterAll(() => t.app.close());

const json = { origin: WEB_ORIGIN, 'content-type': 'application/json' };

describe('login con enlace mágico', () => {
  it('envía el enlace por correo y al abrirlo deja una sesión', async () => {
    const cookie = await signIn(t, 'ana@example.com');

    const mail = t.mails.at(-1)!;
    expect(mail.to).toBe('ana@example.com');
    expect(mail.subject).toMatch(/enlace/i);

    const me = await t.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json<Me>()).toMatchObject({ email: 'ana@example.com', name: '', avatar: 0 });
  });

  it('el enlace solo sirve una vez', async () => {
    await signIn(t, 'ana@example.com');
    const link = new URL(t.mails.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
    const again = await t.app.inject({ method: 'GET', url: link.pathname + link.search });
    expect(again.statusCode).toBe(302);
    expect(again.headers.location).toContain('error=');
    expect(again.headers['set-cookie']).toBeUndefined();
  });

  it('no redirige fuera de la web tras el login', async () => {
    const sent = t.mails.length;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: json,
      payload: { email: 'ana@example.com', callbackURL: 'https://evil.example/' },
    });
    expect(res.statusCode).toBe(403);
    expect(t.mails).toHaveLength(sent);
  });

  it('cierra la sesión', async () => {
    const cookie = await signIn(t, 'ana@example.com');
    const out = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { ...json, cookie },
      payload: {},
    });
    expect(out.statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('informa de que Google está desactivado si no hay credenciales', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/auth/options' });
    expect(res.json()).toEqual({ google: false });
  });
});

describe('límite de intentos', () => {
  it('con el límite activo (producción), frena las peticiones de enlace repetidas', async () => {
    const { app } = await createTestApp({ rateLimit: true });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/magic-link',
        headers: json,
        payload: { email: `spam${i}@example.com`, callbackURL: `${WEB_ORIGIN}/` },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
    await app.close();
  });
});

describe('perfil (/me)', () => {
  it('exige sesión', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('guarda nombre y avatar validados', async () => {
    const cookie = await signIn(t, 'ana@example.com');
    const ok = await t.app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...json, cookie },
      payload: { name: '  Ana  ', avatar: 3 },
    });
    expect(ok.json<Me>()).toMatchObject({ name: 'Ana', avatar: 3 });

    const bad = await t.app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...json, cookie },
      payload: { name: 'Ana', avatar: 42 },
    });
    expect(bad.statusCode).toBe(400);

    const me = await t.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(me.json<Me>()).toMatchObject({ name: 'Ana', avatar: 3 });
  });

  it('rechaza cambios desde otro origen (CSRF)', async () => {
    const cookie = await signIn(t, 'ana@example.com');
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...json, origin: 'https://evil.example', cookie },
      payload: { name: 'Hacker', avatar: 0 },
    });
    expect(res.statusCode).toBe(403);
  });
});
