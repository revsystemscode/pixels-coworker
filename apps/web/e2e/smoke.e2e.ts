import { expect, test, type Page } from '@playwright/test';
import {
  API_URL,
  closeBrowsers,
  completeProfile,
  createSpace,
  newBrowserPage,
  signIn,
  uniqueEmail,
} from './helpers.js';

// Prueba de humo de un despliegue (compilación de producción, sin ganchos de depuración): solo usa
// la interfaz. Ejemplo, contra la pila de producción en local:
//   E2E_SMOKE=1 E2E_BASE_URL=https://pixels.localhost/ E2E_API_URL=https://pixels.localhost/api \
//   E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @pixels/web e2e smoke
test.skip(!process.env.E2E_SMOKE, 'Solo con E2E_SMOKE=1');
test.afterEach(closeBrowsers);
test.setTimeout(120_000);

/**
 * Errores de consola por la política de seguridad (CSP): no debería haber ninguno. Excepción:
 * Excalidraw añade a cada fuente una copia de reserva en esm.sh; las fuentes se sirven desde el propio
 * dominio y la reserva se bloquea a propósito (así no se descarga nada de terceros).
 */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    if (!/Content Security Policy|Refused to/i.test(text)) return;
    if (/Loading the font 'https:\/\/esm\.sh\/@excalidraw\//.test(text)) return;
    violations.push(text);
  });
  return violations;
}

async function enter(page: Page) {
  for (const device of ['micrófono', 'cámara']) {
    const toggle = page.getByRole('button', { name: new RegExp(`Apagar ${device}`) });
    if (await toggle.isVisible()) await toggle.click();
  }
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.game-canvas canvas')).toBeVisible({ timeout: 20_000 });
}

test('dos personas entran, se ven por video, chatean y usan la pizarra y el editor', async () => {
  const ana = await newBrowserPage();
  const anaCsp = watchCsp(ana);
  await signIn(ana, uniqueEmail('Ana'));
  await completeProfile(ana, 'Ana', 1);
  const spaceId = await createSpace(ana, `Humo ${Date.now()}`);
  // La invitación se crea desde la propia página (como la web): mismo origen y misma cookie.
  const { token } = await ana.evaluate(async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'member', days: 1 }),
    });
    return (await res.json()) as { token: string };
  }, `${API_URL}/spaces/${spaceId}/invites`);
  await enter(ana);

  const bea = await newBrowserPage();
  const beaCsp = watchCsp(bea);
  await signIn(bea, uniqueEmail('Bea'), `/i/${token}`);
  await bea.getByRole('button', { name: 'Unirme al espacio' }).click();
  await completeProfile(bea, 'Bea', 2);
  await bea.waitForURL(new RegExp(`/s/${spaceId}$`));
  await enter(bea);

  // Aparecen las dos en el mismo sitio: el video se conecta (LiveKit) y se ven las burbujas.
  await expect(ana.locator('.bubble-name').filter({ hasText: 'Bea' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(bea.locator('.bubble-name').filter({ hasText: 'Ana' })).toBeVisible();

  await ana.getByLabel('Mensaje').fill('hola desde producción');
  await ana.keyboard.press('Enter');
  await expect(bea.getByText('hola desde producción')).toBeVisible();

  // Ana camina con el teclado hasta la pizarra de la oficina (unas 9 casillas a la izquierda y 5
  // arriba desde el inicio) y la abre: Excalidraw carga sus fuentes y su código desde el propio dominio.
  await ana.locator('.game-canvas canvas').click({ position: { x: 5, y: 5 } });
  for (const [key, tiles] of [
    ['ArrowLeft', 9],
    ['ArrowUp', 5],
  ] as const) {
    await ana.keyboard.down(key);
    await ana.waitForTimeout(tiles * 175);
    await ana.keyboard.up(key);
    await ana.waitForTimeout(300);
  }
  await ana.getByRole('button', { name: /Abrir «Pizarra de la oficina»/ }).click();
  await expect(ana.getByTestId('toolbar-rectangle')).toBeVisible({ timeout: 20_000 });
  await ana.getByTestId('toolbar-rectangle').locator('xpath=..').click();
  const box = (await ana.locator('.board-canvas').boundingBox())!;
  await ana.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await ana.mouse.down();
  await ana.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 5 });
  await ana.mouse.up();
  await ana.getByRole('button', { name: 'Cerrar pizarra' }).click();

  // El editor de mapas: carga los tilesets.
  await ana.goto(new URL(`/s/${spaceId}/editor`, ana.url()).toString());
  await expect(ana.getByTestId('editor-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(ana.getByText('Sin cambios: es el mapa publicado')).toBeVisible();

  expect([...anaCsp, ...beaCsp]).toEqual([]);
});
