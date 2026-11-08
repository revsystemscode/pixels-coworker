import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;

const DEV_TICKET_SECRET = 'dev-ticket-secret';
const DEV_AUTH_SECRET = 'dev-better-auth-secret-not-for-production';

const port = Number(env.API_PORT ?? 3001);
const webOrigin = env.CORS_ORIGIN ?? 'http://localhost:5173';

export const config = {
  port,
  corsOrigin: webOrigin,
  databaseUrl: env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  livekitUrl: env.LIVEKIT_URL ?? 'ws://localhost:7880',
  media: {
    /** La que usa el navegador. En producción suele ser wss://… distinta de la interna. */
    livekitPublicUrl: env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL ?? 'ws://localhost:7880',
    livekitApiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    livekitApiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
    ticketSecret: env.TICKET_SECRET ?? DEV_TICKET_SECRET,
  },
  auth: {
    baseURL: env.API_PUBLIC_URL ?? `http://localhost:${port}`,
    secret: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    webOrigin,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    rateLimit: env.AUTH_RATE_LIMIT !== 'off',
  },
  mail: {
    /** En desarrollo, Mailpit (docker compose). */
    smtpUrl: env.SMTP_URL ?? 'smtp://localhost:1025',
    from: env.MAIL_FROM ?? 'pixels-coworker <no-reply@pixels.local>',
  },
};

if (env.NODE_ENV === 'production') {
  const missing = [
    ['LIVEKIT_API_KEY', env.LIVEKIT_API_KEY],
    ['LIVEKIT_API_SECRET', env.LIVEKIT_API_SECRET],
    ['TICKET_SECRET', env.TICKET_SECRET],
    ['BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET],
    ['API_PUBLIC_URL', env.API_PUBLIC_URL],
    ['SMTP_URL', env.SMTP_URL],
  ].filter(([, v]) => !v);
  if (missing.length) throw new Error(`Faltan variables: ${missing.map(([k]) => k).join(', ')}`);
  if (!config.auth.rateLimit) throw new Error('AUTH_RATE_LIMIT=off no se permite en producción');
}

export type Config = typeof config;
