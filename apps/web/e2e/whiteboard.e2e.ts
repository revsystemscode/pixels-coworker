import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, closeBrowsers, enterSpace, joinAs, walkTo } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(120_000);

const BOARD = 'Pizarra de la oficina';

/** Lo dibujado en la pizarra abierta (tipos, en orden). */
const drawn = (page: Page) =>
  page.evaluate(() => window.__pixels?.board?.().map((e) => e.type) ?? null);

/** Dibuja una figura arrastrando el ratón dentro de la pizarra. */
async function draw(page: Page, tool: 'rectangle' | 'ellipse', dx: number) {
  // El botón de la herramienta es un radio oculto; se pulsa su etiqueta (el icono).
  await page.getByTestId(`toolbar-${tool}`).locator('xpath=..').click();
  const box = (await page.locator('.board-canvas').boundingBox())!;
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.mouse.move(x + 120, y + 80, { steps: 5 });
  await page.mouse.up();
}

test('dos personas dibujan en la misma pizarra y lo dibujado se queda', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const spaceId = new URL(ana.url()).pathname.split('/').pop()!;

  // La pizarra de la oficina está en la pared (x 9–12, y 9–10). Desde lejos no se ofrece abrirla.
  await expect(ana.getByRole('button', { name: /Abrir «/ })).toBeHidden();
  await walkTo(ana, 10, 11);
  await walkTo(bea, 12, 12);

  // Ana la abre con el botón; Bea, con la tecla E.
  await ana.getByRole('button', { name: `Abrir «${BOARD}» E` }).click();
  await bea.keyboard.press('e');
  for (const page of [ana, bea]) {
    const dialog = page.getByRole('dialog', { name: BOARD });
    await expect(
      dialog.getByRole('list', { name: 'En la pizarra' }).getByRole('listitem'),
    ).toHaveCount(2, { timeout: 20_000 });
    // Excalidraw se carga al abrir la pizarra.
    await expect(page.getByTestId('toolbar-rectangle')).toBeVisible({ timeout: 20_000 });
  }

  // Se puede silenciar el micrófono sin cerrar la pizarra (entraron con él apagado).
  await expect(
    ana.getByRole('dialog', { name: BOARD }).getByRole('button', { name: 'Activar micrófono' }),
  ).toBeVisible();

  // Lo que dibuja cada una le aparece a la otra.
  await draw(ana, 'rectangle', -200);
  await expect.poll(() => drawn(bea)).toEqual(['rectangle']);
  await draw(bea, 'ellipse', 100);
  await expect.poll(() => drawn(ana)).toEqual(['rectangle', 'ellipse']);
  if (process.env.E2E_SCREENSHOTS)
    await ana.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/board.png` });

  // Las dos la cierran y salen del espacio: la sala se cierra y la pizarra queda guardada.
  for (const page of [ana, bea]) {
    await page.getByRole('button', { name: 'Cerrar pizarra' }).click();
    await expect(page.getByRole('dialog', { name: BOARD })).toBeHidden();
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mis espacios' })).toBeVisible();
  }

  // Ana vuelve otro día (aparece donde lo dejó, junto a la pizarra) y lo encuentra todo.
  await ana.goto(new URL(`s/${spaceId}`, BASE_URL).toString());
  await enterSpace(ana);
  await ana.getByRole('button', { name: `Abrir «${BOARD}» E` }).click();
  await expect(ana.getByTestId('toolbar-rectangle')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => drawn(ana)).toEqual(['rectangle', 'ellipse']);
});
