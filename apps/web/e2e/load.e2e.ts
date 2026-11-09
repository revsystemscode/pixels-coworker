import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { GameServerHealth } from '@pixels/shared';
import { closeBrowsers, joinAs, snapshot } from './helpers.js';

// Prueba de carga: el espacio lleno (98 bots y dos personas = 100, el máximo por sala). Tarda unos minutos, así que solo se
// ejecuta si se pide: LOAD_TEST=1 pnpm --filter @pixels/web e2e load
// Los FPS dependen de la GPU: con WebGL por software (CI, Linux sin GPU) salen bajos; en un portátil
// normal se mide con LOAD_TEST_GPU=1 (usa la GPU del equipo).
test.skip(!process.env.LOAD_TEST, 'Solo con LOAD_TEST=1');
test.afterEach(closeBrowsers);
test.setTimeout(300_000);

const BOTS = Number(process.env.LOAD_TEST_BOTS ?? 98);
const SECONDS = 60;
const GAME_URL = `http://localhost:${process.env.GAME_SERVER_PORT ?? 2567}`;
const repo = fileURLToPath(new URL('../../..', import.meta.url));

test(`${BOTS} bots y dos personas en el mismo espacio (lleno)`, async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const spaceId = new URL(ana.url()).pathname.split('/').pop()!;

  const bots = spawn(
    'pnpm',
    ['--filter', '@pixels/game-server', 'bots', '--', String(BOTS), String(SECONDS + 20), spaceId],
    {
      cwd: repo,
      env: { ...process.env, VITE_GAME_SERVER_URL: GAME_URL },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  let output = '';
  bots.stdout.on('data', (d: Buffer) => (output += d.toString()));
  const finished = new Promise<void>((resolve) => bots.on('exit', () => resolve()));

  await expect
    .poll(async () => (await snapshot(ana)).players.length, { timeout: 120_000 })
    .toBe(BOTS + 2);

  // Durante SECONDS segundos: FPS de las dos personas y carga del servidor.
  const fps: number[] = [];
  let maxLag = 0;
  let maxRss = 0;
  for (let i = 0; i < SECONDS / 2; i++) {
    await ana.waitForTimeout(2_000);
    fps.push((await snapshot(ana)).fps, (await snapshot(bea)).fps);
    const health = (await (await fetch(`${GAME_URL}/health`)).json()) as GameServerHealth;
    maxLag = Math.max(maxLag, health.load.eventLoopP99Ms);
    maxRss = Math.max(maxRss, health.load.rssMb);
  }
  await finished;
  const sorted = [...fps].sort((a, b) => a - b);
  const report = {
    jugadores: BOTS + 2,
    fpsMediana: sorted[Math.floor(sorted.length / 2)],
    fpsMinimo: sorted[0],
    bucleDeEventosP99Ms: maxLag,
    memoriaMb: maxRss,
    bots: output.trim().split('\n').at(-1),
  };
  console.log('CARGA', JSON.stringify(report, null, 2));
  // El servidor no se atasca (el estado sale cada 66 ms).
  expect(maxLag).toBeLessThan(50);
  if (process.env.LOAD_TEST_GPU) expect(report.fpsMediana).toBeGreaterThanOrEqual(30);
});
