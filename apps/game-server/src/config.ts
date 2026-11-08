import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_PLAYERS_PER_ROOM } from '@pixels/shared';

// Carga el .env de la raíz del monorepo si existe (Node >= 21.7).
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const DEV_TICKET_SECRET = 'dev-ticket-secret';

export const config = {
  port: Number(process.env.GAME_SERVER_PORT ?? 2567),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Jugadores por sala. Se puede subir para pruebas de carga (ROOM_MAX_CLIENTS=60). */
  roomMaxClients: Number(process.env.ROOM_MAX_CLIENTS ?? MAX_PLAYERS_PER_ROOM),
  /** Secreto compartido con la API para los tickets. */
  ticketSecret: process.env.TICKET_SECRET ?? DEV_TICKET_SECRET,
};

if (process.env.NODE_ENV === 'production' && config.ticketSecret === DEV_TICKET_SECRET) {
  throw new Error('Falta TICKET_SECRET en producción');
}
