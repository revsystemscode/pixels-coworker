import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

const TILE = 16;
const BASE_URL = 'http://localhost:5173/';
const LAUNCH = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const browsers: Browser[] = [];

test.afterEach(async () => {
  await Promise.all(browsers.splice(0).map((b) => b.close()));
});

/**
 * Cada jugador abre su propio navegador. (Con WebGL por software, dos páginas del mismo
 * navegador comparten el proceso de GPU y la segunda se bloquea; con GPU real no pasa.)
 */
async function joinAs(name: string, avatar = 1): Promise<Page> {
  const browser = await chromium.launch(LAUNCH);
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE_URL);
  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('radio', { name: `Avatar ${avatar}` }).check();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => (window.__pixels?.snapshot()?.players.length ?? 0) >= 1, null, {
    polling: 100,
  });
  return page;
}

const snapshot = (page: Page) => page.evaluate(() => window.__pixels!.snapshot()!);

async function positionOf(page: Page, id: string) {
  const s = await snapshot(page);
  return s.players.find((p) => p.id === id) ?? null;
}

test('dos jugadores se ven y el movimiento llega interpolado', async () => {
  const alice = await joinAs('Alice', 1);
  const bob = await joinAs('Bob', 2);
  const aliceId = (await snapshot(alice)).selfId;

  // Bob ve a Alice.
  await expect.poll(async () => (await positionOf(bob, aliceId)) !== null).toBe(true);
  const start = (await positionOf(bob, aliceId))!;

  // Bob muestrea en cada frame lo que ve de Alice hasta verla 3 casillas a la derecha.
  const goalX = start.x + 3 * TILE;
  const samples = bob.evaluate(
    ([id, goal]) =>
      new Promise<number[]>((resolve) => {
        const xs: number[] = [];
        const deadline = performance.now() + 10_000;
        const tick = () => {
          const p = window.__pixels?.snapshot()?.players.find((q) => q.id === id);
          if (p) xs.push(p.x);
          if ((p && p.x >= goal) || performance.now() > deadline) resolve(xs);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    [aliceId, goalX] as const,
  );

  // Alice mantiene la flecha pulsada hasta empezar el tercer paso (independiente de los FPS).
  await alice.keyboard.down('ArrowRight');
  await expect
    .poll(async () => (await positionOf(alice, aliceId))!.x, { intervals: [20], timeout: 10_000 })
    .toBeGreaterThan(start.x + 2 * TILE);
  await alice.keyboard.up('ArrowRight');

  const xs = await samples;
  // Bob termina viendo a Alice exactamente donde Alice se ve a sí misma.
  await expect.poll(() => positionOf(alice, aliceId).then((p) => p!.x % TILE)).toBe(TILE / 2);
  const own = (await positionOf(alice, aliceId))!;
  await expect.poll(() => positionOf(bob, aliceId)).toEqual(own);
  expect(own.y).toBe(start.y);
  expect(own.x).toBeGreaterThanOrEqual(goalX);

  // Interpolado: Bob ve posiciones entre casillas, no solo saltos de casilla en casilla.
  // (Al menos una por casilla recorrida; con GPU real hay muchas más.)
  const tilesMoved = (own.x - start.x) / TILE;
  const between = new Set(xs.filter((x) => (x - TILE / 2) % TILE !== 0));
  expect(between.size, `muestras: ${JSON.stringify([...new Set(xs)])}`).toBeGreaterThanOrEqual(
    tilesMoved,
  );
});

test('clic en el mapa lleva al avatar hasta esa casilla', async () => {
  const page = await joinAs('Clic');
  const { selfId } = await snapshot(page);
  const start = (await positionOf(page, selfId))!;

  // La cámara sigue al avatar: está en el centro del canvas. 2 casillas a la izquierda con zoom 3.
  const canvas = page.locator('.game-canvas canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 2 * TILE * 3, box.y + box.height / 2);

  await expect
    .poll(async () => (await positionOf(page, selfId))?.x, { timeout: 5000 })
    .toBe(start.x - 2 * TILE);
});

test('el chat llega a los demás jugadores', async () => {
  const alice = await joinAs('Alice');
  const bob = await joinAs('Bob');

  const text = `hola desde e2e ${Date.now()}`;
  await alice.keyboard.press('Enter');
  await alice.getByLabel('Mensaje').fill(text);
  await alice.getByLabel('Mensaje').press('Enter');

  await expect(bob.getByRole('complementary', { name: 'Chat de la sala' })).toContainText(text);
  await expect(bob.getByText('Alice').last()).toBeVisible();
});

test('escribir en el chat no mueve al avatar', async () => {
  const page = await joinAs('Escribe');
  const { selfId } = await snapshot(page);
  const start = await positionOf(page, selfId);

  await page.getByLabel('Mensaje').click();
  await page.keyboard.type('wasd wasd');
  await page.waitForTimeout(400);
  expect(await positionOf(page, selfId)).toEqual(start);
  await expect(page.getByLabel('Mensaje')).toHaveValue('wasd wasd');
});
