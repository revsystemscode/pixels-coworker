import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;

export const config = {
  port: Number(env.API_PORT ?? 3001),
  corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  livekitUrl: env.LIVEKIT_URL ?? 'ws://localhost:7880',
};

export type Config = typeof config;
