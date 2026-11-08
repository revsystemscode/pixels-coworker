// Configuración común de las pruebas (no se incluye en el build).
import { createDb, type Db } from '@pixels/db';
import { resetDatabase, testDatabaseUrl } from '@pixels/db/testing';
import { afterAll, beforeEach } from 'vitest';
import { buildApp, type AppOptions } from './app.js';
import type { Mail } from './mail.js';
import type { MediaOptions } from './media.js';

export const WEB_ORIGIN = 'http://localhost:5173';
export const API_URL = 'http://localhost:3001';

export const testMedia: MediaOptions = {
  livekitPublicUrl: 'ws://livekit.test',
  livekitApiKey: 'test-key',
  livekitApiSecret: 'test-secret-that-is-long-enough-123',
  mediaTicketSecret: 'ticket-secret',
  now: () => 1_000,
};

let sharedDb: Db | null = null;

/** Cliente de la base de pruebas (pixels_test), compartido por el archivo de pruebas. */
export function testDb(): Db {
  sharedDb ??= createDb(testDatabaseUrl());
  return sharedDb;
}

/** Vacía la base antes de cada prueba y cierra la conexión al final. */
export function useCleanDatabase() {
  beforeEach(() => resetDatabase(testDb()));
  afterAll(() => sharedDb?.$disconnect());
}

export async function createTestApp(overrides: Partial<AppOptions> = {}) {
  const mails: Mail[] = [];
  const app = await buildApp({
    corsOrigin: WEB_ORIGIN,
    healthChecks: {
      postgres: async () => 'up',
      redis: async () => 'up',
      livekit: async () => 'up',
    },
    media: testMedia,
    db: testDb(),
    auth: {
      baseURL: API_URL,
      secret: 'test-better-auth-secret-0123456789abcdef',
      webOrigin: WEB_ORIGIN,
      google: null,
      rateLimit: false,
      mailer: async (mail) => {
        mails.push(mail);
      },
    },
    ...overrides,
  });
  return { app, mails, db: testDb() };
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * Inicia sesión con enlace mágico como lo haría el navegador: pide el enlace, lo "abre" y devuelve
 * la cookie de sesión.
 */
export async function signIn({ app, mails }: TestApp, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/magic-link',
    headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
    payload: { email, callbackURL: `${WEB_ORIGIN}/` },
  });
  if (res.statusCode !== 200) throw new Error(`magic-link ${res.statusCode}: ${res.body}`);
  const mail = mails.findLast((m) => m.to === email);
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error('No llegó el enlace');
  const url = new URL(link);
  const verify = await app.inject({ method: 'GET', url: url.pathname + url.search });
  const cookies = [verify.headers['set-cookie'] ?? []].flat();
  const session = cookies.find((c) => c.startsWith('pixels.session_token='));
  if (!session) throw new Error(`Sin cookie de sesión (${verify.statusCode})`);
  return session.split(';')[0]!;
}

/** Crea un usuario con sesión y perfil completo. */
export async function signInWithProfile(t: TestApp, email: string, name: string, avatar = 0) {
  const cookie = await signIn(t, email);
  await t.app.inject({
    method: 'PATCH',
    url: '/me',
    headers: { cookie, origin: WEB_ORIGIN },
    payload: { name, avatar },
  });
  return cookie;
}
