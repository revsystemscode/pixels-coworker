import { defineConfig, devices } from '@playwright/test';

// Pruebas E2E: necesitan la web, el servidor de juego y la API, y con Docker Postgres, Redis,
// Mailpit (correos de login) y LiveKit (video). Si las apps ya están en marcha (pnpm dev) se
// reutilizan. Los puertos se pueden cambiar con WEB_PORT, GAME_SERVER_PORT y API_PORT.
const webPort = Number(process.env.WEB_PORT ?? 5173);
const gamePort = Number(process.env.GAME_SERVER_PORT ?? 2567);
const apiPort = Number(process.env.API_PORT ?? 3001);
process.env.E2E_BASE_URL = `http://localhost:${webPort}/`;
process.env.E2E_API_URL = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'pnpm --filter @pixels/game-server dev',
      cwd: '../..',
      url: `http://localhost:${gamePort}/health`,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm --filter @pixels/api dev',
      cwd: '../..',
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: true,
    },
    {
      command: `pnpm --filter @pixels/web exec vite --port ${webPort} --strictPort`,
      cwd: '../..',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: true,
    },
  ],
});
