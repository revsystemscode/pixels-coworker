import { defineConfig, devices } from '@playwright/test';

// Pruebas E2E: necesitan el servidor de juego y la web. Si ya están en marcha (pnpm dev) se reutilizan.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'pnpm --filter @pixels/game-server dev',
      cwd: '../..',
      url: 'http://localhost:2567/health',
      reuseExistingServer: true,
    },
    {
      command: 'pnpm --filter @pixels/web dev',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
