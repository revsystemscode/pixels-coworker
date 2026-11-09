import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;

const DEV_TICKET_SECRET = 'dev-ticket-secret';
const DEV_AUTH_SECRET = 'dev-better-auth-secret-not-for-production';
/** Valores de desarrollo (del .env.example y del modo --dev de LiveKit). */
const DEV_VALUES = new Set([DEV_TICKET_SECRET, DEV_AUTH_SECRET, 'secret', 'devkey']);

const port = Number(env.API_PORT ?? 3001);

/** TRUST_PROXY: «true» o una lista de IPs/redes (por ejemplo, la red de Docker). Sin definir: no. */
function parseTrustProxy(raw: string | undefined): boolean | string {
  if (!raw || raw === 'false') return false;
  return raw === 'true' ? true : raw;
}
const webOrigin = env.CORS_ORIGIN ?? 'http://localhost:5173';

export const config = {
  port,
  /** Peticiones por minuto y por IP en toda la API. */
  rateLimitPerMinute: Number(env.API_RATE_LIMIT ?? 600),
  version: env.APP_VERSION ?? 'dev',
  /** DSN de Sentry de la web: la API reenvía sus informes (túnel) solo a ese proyecto. */
  monitoring: { webDsn: env.SENTRY_DSN_WEB ?? null },
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
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
    // Límite de intentos de login por IP: siempre en producción; en desarrollo, con AUTH_RATE_LIMIT=on
    // (apagado por defecto para que las pruebas E2E puedan iniciar muchas sesiones seguidas).
    rateLimit: env.AUTH_RATE_LIMIT ? env.AUTH_RATE_LIMIT !== 'off' : env.NODE_ENV === 'production',
  },
  mail: {
    /** En desarrollo, Mailpit (docker compose). */
    smtpUrl: env.SMTP_URL ?? 'smtp://localhost:1025',
    from: env.MAIL_FROM ?? 'pixels-coworker <no-reply@pixels.local>',
  },
};

if (env.NODE_ENV === 'production') {
  const problems = productionProblems(env, config.auth.rateLimit);
  if (problems.length)
    throw new Error(`Configuración de producción no válida: ${problems.join('; ')}`);
}

/**
 * En producción no se arranca con valores de desarrollo: secretos que faltan, cortos o de ejemplo,
 * claves de LiveKit del modo --dev, direcciones sin HTTPS o el buzón de pruebas.
 */
export function productionProblems(env: NodeJS.ProcessEnv, authRateLimit: boolean): string[] {
  const problems: string[] = [];
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'LIVEKIT_URL',
    'LIVEKIT_PUBLIC_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'TICKET_SECRET',
    'BETTER_AUTH_SECRET',
    'API_PUBLIC_URL',
    'CORS_ORIGIN',
    'SMTP_URL',
    'MAIL_FROM',
  ];
  for (const key of required) if (!env[key]) problems.push(`falta ${key}`);
  for (const key of ['TICKET_SECRET', 'BETTER_AUTH_SECRET', 'LIVEKIT_API_SECRET']) {
    const value = env[key] ?? '';
    if (value && (value.length < 32 || DEV_VALUES.has(value) || /cambia/i.test(value))) {
      problems.push(`${key} debe ser largo y aleatorio (openssl rand -base64 32)`);
    }
  }
  if (env.LIVEKIT_API_KEY === 'devkey') problems.push('LIVEKIT_API_KEY es la del modo --dev');
  for (const key of ['API_PUBLIC_URL', 'CORS_ORIGIN']) {
    if (env[key] && !env[key].startsWith('https://'))
      problems.push(`${key} debe empezar por https://`);
  }
  if (env.LIVEKIT_PUBLIC_URL && !env.LIVEKIT_PUBLIC_URL.startsWith('wss://')) {
    problems.push('LIVEKIT_PUBLIC_URL debe empezar por wss://');
  }
  if (/localhost:1025|mailpit/.test(env.SMTP_URL ?? ''))
    problems.push('SMTP_URL es el buzón de pruebas');
  if (!authRateLimit) problems.push('AUTH_RATE_LIMIT=off no se permite');
  return problems;
}

export type Config = typeof config;
