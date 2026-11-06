import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Usa el código fuente de @pixels/shared sin compilarlo antes.
  ssr: { resolve: { conditions: ['source'] } },
  resolve: { conditions: ['source'] },
});
