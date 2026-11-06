import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const config = {
  port: Number(process.env.GAME_SERVER_PORT ?? 2567),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};
