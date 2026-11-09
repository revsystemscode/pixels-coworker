import { expect, test, type Page } from '@playwright/test';
import { closeBrowsers, joinAs, walkTo } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(150_000);

const TABLE = 'Mesa de juegos';
const panel = (page: Page) => page.getByRole('dialog', { name: TABLE });
const cell = (page: Page, n: number) =>
  panel(page).getByRole('button', { name: new RegExp(`^Casilla ${n}:`) });

test('dos juegan al tres en raya en la mesa y una tercera persona mira', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const carla = await joinAs('Carla', 3);

  // La mesa está en el centro de la oficina abierta (x 24–25, y 16), con una silla a cada lado.
  await walkTo(ana, 23, 15);
  await walkTo(bea, 26, 17);
  await walkTo(carla, 25, 18);

  await ana.keyboard.press('e');
  await bea.getByRole('button', { name: `Jugar en «${TABLE}» E` }).click();
  await carla.keyboard.press('e');
  for (const page of [ana, bea, carla]) await expect(panel(page)).toContainText('3 en la mesa');

  await panel(ana).getByRole('button', { name: 'Sentarme a jugar' }).click();
  await expect(panel(ana)).toContainText('Esperando a que se siente otra persona');
  await panel(bea).getByRole('button', { name: 'Sentarme a jugar' }).click();
  await expect(panel(ana)).toContainText('Te toca (X)');
  // Ya no quedan asientos para Carla.
  await expect(panel(carla).getByRole('button', { name: 'Sentarme a jugar' })).toHaveCount(0);
  await expect(panel(carla)).toContainText('Turno de Ana (X)');

  // Ana gana con la fila de arriba (casillas 1, 2 y 3). Bea no puede jugar fuera de su turno.
  const moves: [Page, number][] = [
    [ana, 1],
    [bea, 4],
    [ana, 2],
    [bea, 5],
    [ana, 3],
  ];
  for (const [page, n] of moves) {
    await expect(cell(page, n)).toBeEnabled();
    await cell(page, n).click();
    await expect(cell(carla, n)).toHaveAccessibleName(/: [XO]$/);
  }
  await expect(cell(bea, 6)).toBeDisabled();
  await expect(panel(ana)).toContainText('¡Has ganado!');
  await expect(panel(bea)).toContainText('Ha ganado Ana.');
  await expect(panel(carla)).toContainText('Ha ganado Ana.');

  // Revancha: empieza Bea.
  await panel(bea).getByRole('button', { name: 'Otra partida' }).click();
  await expect(panel(bea)).toContainText('Te toca (O)');
  await expect(cell(carla, 1)).toHaveAccessibleName('Casilla 1: vacía');
  await cell(bea, 5).click();
  if (process.env.E2E_SCREENSHOTS)
    await carla.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/tictactoe.png` });

  // Si Ana se aleja, se le cierra la mesa y deja su asiento libre.
  await walkTo(ana, 20, 16);
  await expect(panel(ana)).toBeHidden();
  await expect(panel(bea)).toContainText('Asiento libre');
  await expect(panel(bea)).toContainText('2 en la mesa');
});
