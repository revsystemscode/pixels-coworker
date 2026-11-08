import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Usa el código fuente de @pixels/shared y @pixels/db sin compilarlos antes.
  ssr: { resolve: { conditions: ['source'] } },
  resolve: {
    conditions: ['source'],
    // El globalSetup no aplica la condición `source`: se apunta al código fuente directamente.
    alias: {
      '@pixels/db/testing': fileURLToPath(
        new URL('../../packages/db/src/testing.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Las pruebas usan una base de datos real (pixels_test) y la vacían: una a una.
    globalSetup: ['src/test-setup.ts'],
    fileParallelism: false,
  },
});
