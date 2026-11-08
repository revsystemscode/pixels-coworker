import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';
export type { Prisma } from './generated/client.js';

/** Crea el cliente de base de datos. Usa una sola instancia por proceso (cada una abre un pool). */
export function createDb(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type Db = ReturnType<typeof createDb>;
