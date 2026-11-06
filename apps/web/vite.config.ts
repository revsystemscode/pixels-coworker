import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Lee el .env de la raíz del monorepo (solo las variables VITE_* llegan al navegador).
  envDir: '../..',
  // Usa el código fuente de @pixels/shared sin compilarlo antes.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: { port: 5173, strictPort: true },
});
