import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_PLAYERS_PER_ROOM } from '@pixels/shared';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const config = {
  port: Number(process.env.GAME_SERVER_PORT ?? 2567),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  /** Jugadores por sala. Se puede subir para pruebas de carga (ROOM_MAX_CLIENTS=60). */
  roomMaxClients: Number(process.env.ROOM_MAX_CLIENTS ?? MAX_PLAYERS_PER_ROOM),
};
