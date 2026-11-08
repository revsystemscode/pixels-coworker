import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';

export type Db = PrismaClient;

/** Crea el cliente de base de datos. Usa una sola instancia por proceso (cada una abre un pool). */
export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
