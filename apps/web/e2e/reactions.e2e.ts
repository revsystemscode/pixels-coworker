import { expect, test } from '@playwright/test';
import { closeBrowsers, joinAs, snapshot } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(90_000);

test('las reacciones y la mano levantada se ven sobre el avatar', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const anaId = (await snapshot(ana)).selfId;
  const anaSeenByBea = async () => (await snapshot(bea)).players.find((p) => p.id === anaId);

  // Con el botón…
  await ana.getByRole('button', { name: 'Reaccionar' }).click();
  await ana.getByRole('button', { name: 'Saludar' }).click();
  await expect.poll(async () => (await anaSeenByBea())?.emote).toBe('👋');
  // Están cerca: también se ve en la burbuja de video de Ana.
  await expect(bea.locator(`[data-peer="${anaId}"] .bubble-emote`)).toHaveText('👋');
  // …y desaparece sola a los pocos segundos.
  await expect.poll(async () => (await anaSeenByBea())?.emote, { timeout: 6_000 }).toBeNull();

  // Con el teclado (2 = 👍).
  await ana.locator('canvas').click({ position: { x: 5, y: 5 } });
  await ana.keyboard.press('2');
  await expect.poll(async () => (await anaSeenByBea())?.emote).toBe('👍');

  // La mano se queda hasta que se baja.
  await ana.getByRole('button', { name: 'Levantar la mano' }).click();
  await expect.poll(async () => (await anaSeenByBea())?.hand).toBe(true);
  await expect(bea.locator(`[data-peer="${anaId}"]`).getByTitle('Mano levantada')).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) {
    await ana.keyboard.press('5');
    await ana.getByRole('button', { name: 'Reaccionar' }).click();
    await bea.waitForTimeout(500);
    await ana.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/reactions.png` });
    await ana.getByRole('button', { name: 'Reaccionar' }).click();
  }
  await expect(ana.getByRole('button', { name: 'Bajar la mano' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await ana.keyboard.press('h');
  await expect.poll(async () => (await anaSeenByBea())?.hand).toBe(false);
});
