// Utilidades para pruebas con una base de datos real (pixels_test). No se usa en producción.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Db } from './index.js';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

/** URL de la base de pruebas: TEST_DATABASE_URL o la de desarrollo con la base `pixels_test`. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  );
  url.pathname = '/pixels_test';
  return url.toString();
}

/** Crea la base de pruebas si no existe y le aplica las migraciones. Para el globalSetup de Vitest. */
export async function prepareTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await client.end();
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return url;
}

/** Vacía todas las tablas (entre pruebas). */
export async function resetDatabase(db: Db) {
  await db.$executeRawUnsafe(
    'TRUNCATE users, sessions, accounts, verifications, maps, spaces, memberships, invites CASCADE',
  );
}
