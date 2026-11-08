import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;

const DEV_MEDIA_TICKET_SECRET = 'dev-media-ticket-secret';

export const config = {
  port: Number(env.API_PORT ?? 3001),
  corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  livekitUrl: env.LIVEKIT_URL ?? 'ws://localhost:7880',
  media: {
    /** La que usa el navegador. En producción suele ser wss://… distinta de la interna. */
    livekitPublicUrl: env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL ?? 'ws://localhost:7880',
    livekitApiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    livekitApiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
    mediaTicketSecret: env.MEDIA_TICKET_SECRET ?? DEV_MEDIA_TICKET_SECRET,
  },
};

if (env.NODE_ENV === 'production') {
  const missing = [
    ['LIVEKIT_API_KEY', env.LIVEKIT_API_KEY],
    ['LIVEKIT_API_SECRET', env.LIVEKIT_API_SECRET],
    ['MEDIA_TICKET_SECRET', env.MEDIA_TICKET_SECRET],
  ].filter(([, v]) => !v);
  if (missing.length) throw new Error(`Faltan variables: ${missing.map(([k]) => k).join(', ')}`);
}

export type Config = typeof config;
