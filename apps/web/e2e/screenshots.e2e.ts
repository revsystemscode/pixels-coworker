import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  BASE_URL,
  closeBrowsers,
  joinAs,
  newBrowserPage,
  signIn,
  snapshot,
  uniqueEmail,
  walkTo,
} from './helpers.js';

// Capturas del producto para el README (docs/screenshots/). Solo con SCREENSHOTS=1:
//   SCREENSHOTS=1 pnpm --filter @pixels/web e2e screenshots
test.skip(!process.env.SCREENSHOTS, 'Solo con SCREENSHOTS=1');
test.afterEach(closeBrowsers);
test.setTimeout(240_000);

const DIR = new URL('../../../docs/screenshots/', import.meta.url).pathname;
const SIZE = { width: 1440, height: 900 };

/** Sin el contador de FPS de desarrollo. */
async function shot(
  page: Page,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
) {
  await page.addStyleTag({ content: '.fps { display: none !important; }' });
  await page.screenshot({ path: `${DIR}${name}.png`, ...(clip ? { clip } : {}) });
}

async function say(page: Page, text: string) {
  await page.getByLabel('Mensaje').fill(text);
  await page.keyboard.press('Enter');
  // Fuera del campo de texto: así las teclas vuelven al juego (sin mover a nadie).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('capturas del producto', async () => {
  mkdirSync(DIR, { recursive: true });

  // Perfil: personaje y colores.
  const dani = await newBrowserPage();
  await dani.setViewportSize(SIZE);
  await signIn(dani, uniqueEmail('Dani'));
  await dani.getByLabel('Nombre').fill('Dani');
  await dani.getByRole('radio', { name: 'Avatar 6' }).check();
  for (const [part, color] of [
    ['Camiseta', 'Morado'],
    ['Pelo', 'Rosa'],
    ['Piel', 'Media'],
  ]) {
    await dani.getByRole('radio', { name: `${part}: ${color}` }).check();
  }
  // El correo de prueba no queda bonito en una captura.
  await dani.getByText(/Entraste como/).evaluate((el) => {
    el.textContent = 'Tu nombre y tu avatar se ven en el mapa. Entraste como dani@ejemplo.com.';
  });
  await dani.waitForTimeout(300);
  const card = (await dani.locator('form.card').boundingBox())!;
  await shot(dani, 'avatar', {
    x: card.x - 24,
    y: card.y - 24,
    width: card.width + 48,
    height: card.height + 48,
  });
  await dani.close();

  // Tres personas en la oficina.
  const ana = await joinAs('Ana', 1, {
    spaceName: 'Oficina Pixels',
    colors: { Camiseta: 'Azul', Pelo: 'Castaño' },
  });
  const bea = await joinAs('Bea', 2, { colors: { Camiseta: 'Amarillo' } });
  const carla = await joinAs('Carla', 3, { colors: { Pelo: 'Rubio', Piel: 'Oscura' } });
  for (const p of [ana, bea, carla]) await p.setViewportSize(SIZE);
  await walkTo(bea, 20, 16);
  await walkTo(carla, 19, 17);
  await walkTo(ana, 18, 16);

  await say(ana, '¡Buenos días! ¿Reunión a las 10?');
  await say(bea, 'Sí, en la sala de reuniones 👍');
  await say(carla, 'Llevo la pizarra preparada');
  await carla.keyboard.press('h');
  await expect.poll(async () => (await snapshot(ana)).players.find((p) => p.hand)).toBeTruthy();
  await bea.keyboard.press('5');
  await expect.poll(async () => (await snapshot(ana)).players.find((p) => p.emote)).toBeTruthy();
  await ana.waitForTimeout(400);
  await shot(ana, 'oficina');

  // Pizarra compartida.
  await walkTo(ana, 10, 11);
  await walkTo(bea, 12, 12);
  await ana.keyboard.press('e');
  await bea.keyboard.press('e');
  await expect(ana.getByTestId('toolbar-rectangle')).toBeVisible({ timeout: 20_000 });
  await expect(bea.getByTestId('toolbar-rectangle')).toBeVisible({ timeout: 20_000 });
  const box = (await ana.locator('.board-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const drag = async (page: Page, tool: string, from: [number, number], to: [number, number]) => {
    await page.getByTestId(`toolbar-${tool}`).locator('xpath=..').click();
    await page.mouse.move(cx + from[0], cy + from[1]);
    await page.mouse.down();
    await page.mouse.move(cx + to[0], cy + to[1], { steps: 8 });
    await page.mouse.up();
  };
  await drag(ana, 'rectangle', [-320, -160], [-60, -20]);
  await drag(bea, 'ellipse', [80, -160], [320, -20]);
  await drag(ana, 'arrow', [-50, -90], [70, -90]);
  // La fuente a mano tiene que estar cargada: si no, el texto se mide mal y sale cortado.
  await ana.evaluate(() => document.fonts.load('20px Excalifont'));
  await ana.getByTestId('toolbar-text').locator('xpath=..').click();
  await ana.mouse.click(cx - 250, cy + 60);
  await ana.keyboard.type('Nuevo espacio');
  await ana.keyboard.press('Escape');
  // Sin nada seleccionado.
  await ana.getByTestId('toolbar-selection').locator('xpath=..').click();
  await ana.mouse.click(cx + 200, cy + 200);
  await ana.waitForTimeout(1500);
  await shot(ana, 'pizarra');
  await ana.getByRole('button', { name: 'Cerrar pizarra' }).click();
  await bea.getByRole('button', { name: 'Cerrar pizarra' }).click();

  // Tablón de anuncios (nota editada por la dueña).
  await walkTo(ana, 3, 12);
  await ana.keyboard.press('e');
  const note = ana.getByRole('dialog', { name: 'Tablón de anuncios' });
  await note.getByRole('button', { name: 'Editar' }).click();
  await note
    .getByLabel('Texto de la nota')
    .fill(
      'Reunión de equipo: martes a las 10:00 en la sala de reuniones.\n\nTraed ideas para el nuevo espacio.',
    );
  await note.getByRole('button', { name: 'Guardar' }).click();
  await expect(note).toContainText('Traed ideas');
  await ana.waitForTimeout(300);
  await shot(ana, 'nota');
  await note.getByRole('button', { name: 'Cerrar' }).click();

  // Tres en raya: Ana y Bea juegan; Carla (ya sin la mano levantada) mira.
  await carla.keyboard.press('h');
  // Por encima de la mesa: así las burbujas de video no la tapan.
  await walkTo(ana, 23, 15);
  await walkTo(bea, 26, 15);
  await walkTo(carla, 25, 14);
  for (const p of [ana, bea, carla]) await p.keyboard.press('e');
  const panel = (p: Page) => p.getByRole('dialog', { name: 'Mesa de juegos' });
  await panel(ana).getByRole('button', { name: 'Sentarme a jugar' }).click();
  await expect(panel(bea)).toContainText('Ana');
  await panel(bea).getByRole('button', { name: 'Sentarme a jugar' }).click();
  for (const [p, n] of [
    [ana, 5],
    [bea, 1],
    [ana, 3],
    [bea, 7],
  ] as const) {
    const cell = panel(p).getByRole('button', { name: new RegExp(`^Casilla ${n}:`) });
    await expect(cell).toBeEnabled();
    await cell.click();
  }
  await expect(panel(carla)).toContainText('Turno de Ana');
  await carla.waitForTimeout(300);
  await shot(carla, 'tres-en-raya');

  // Editor de mapas.
  const spaceId = new URL(ana.url()).pathname.split('/').pop()!;
  await ana.goto(new URL(`s/${spaceId}/editor`, BASE_URL).toString());
  await expect(ana.getByTestId('editor-canvas')).toBeVisible({ timeout: 20_000 });
  await ana.getByRole('tab', { name: 'Muebles' }).click();
  await ana.getByRole('button', { name: 'Mesa de reuniones', exact: true }).click();
  await ana.waitForTimeout(800);
  await shot(ana, 'editor');
});
