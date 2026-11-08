import { expect, test } from '@playwright/test';
import { closeBrowsers, joinAs, positionOf, snapshot } from './helpers.js';

const TILE = 16;

test.afterEach(closeBrowsers);

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
  // Solo se puede comprobar si Bob dibuja al menos 2 fotogramas por casilla (cada paso dura
  // 160 ms). Sin GPU y con la máquina muy cargada puede ir más lento: entonces se avisa.
  const tilesMoved = (own.x - start.x) / TILE;
  const between = new Set(xs.filter((x) => (x - TILE / 2) % TILE !== 0));
  const detail = `${xs.length} fotogramas, muestras: ${JSON.stringify([...new Set(xs)])}`;
  if (xs.length >= 2 * (tilesMoved + 1)) {
    expect(between.size, detail).toBeGreaterThan(0);
  } else {
    test.info().annotations.push({
      type: 'aviso',
      description: `Demasiados pocos FPS para comprobar la interpolación (${detail})`,
    });
  }
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
