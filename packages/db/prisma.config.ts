import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Carga el .env de la raíz del monorepo si existe.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://pixels:pixels@localhost:5432/pixels',
  },
});
