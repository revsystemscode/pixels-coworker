import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  closeBrowsers,
  completeProfile,
  createSpace,
  enterSpace,
  magicLinkFor,
  newBrowserPage,
  signIn,
  snapshot,
  uniqueEmail,
  walkTo,
} from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(120_000);

test('una persona crea un espacio, comparte el enlace y otra entra con su cuenta', async () => {
  // A inicia sesión, elige perfil y crea un espacio.
  const ana = await newBrowserPage();
  await signIn(ana, uniqueEmail('ana'));
  await completeProfile(ana, 'Ana', 1);
  await expect(ana.getByRole('heading', { name: 'Mis espacios' })).toBeVisible();
  const spaceName = `Equipo de Ana ${Date.now()}`;
  const spaceId = await createSpace(ana, spaceName);
  await expect(ana.getByRole('heading', { name: spaceName })).toBeVisible();
  await enterSpace(ana);

  // A crea un enlace de invitación desde el panel del espacio.
  await ana.getByRole('button', { name: 'Espacio' }).click();
  const panel = ana.getByRole('dialog', { name: spaceName });
  await panel.getByRole('button', { name: 'Crear enlace' }).click();
  const link = await panel.getByLabel('Enlace de invitación').inputValue();
  expect(link).toMatch(/\/i\/[A-Za-z0-9_-]{32}$/);

  // B abre el enlace sin sesión, inicia sesión con su correo y se une.
  const bea = await newBrowserPage();
  await bea.goto(link);
  await expect(bea.getByRole('heading', { name: `Te invitaron a «${spaceName}»` })).toBeVisible();
  await bea.getByRole('link', { name: 'Iniciar sesión para unirte' }).click();
  const beaEmail = uniqueEmail('bea');
  await bea.getByLabel('Correo').fill(beaEmail);
  await bea.getByRole('button', { name: 'Enviarme un enlace' }).click();
  await bea.goto(await magicLinkFor(beaEmail));
  await bea.getByRole('button', { name: 'Unirme al espacio' }).click();
  await completeProfile(bea, 'Bea', 2);
  await bea.waitForURL(new RegExp(`/s/${spaceId}$`));
  await enterSpace(bea);

  // Los dos están en la misma sala y se ven.
  await expect.poll(async () => (await snapshot(ana)).players.length).toBe(2);
  await expect.poll(async () => (await snapshot(bea)).players.length).toBe(2);

  // A ve a B en la lista de miembros, como miembro.
  await panel.getByRole('button', { name: 'Cerrar' }).click();
  await ana.getByRole('button', { name: 'Espacio' }).click();
  const beaRow = panel.locator('[data-member="Bea"]');
  await expect(beaRow.getByLabel('Rol de Bea')).toHaveValue('member');

  // A expulsa a B: B sale del mapa y ya no puede volver a entrar.
  await beaRow.getByRole('button', { name: 'Expulsar' }).click();
  await expect(bea.getByText('Ya no tienes acceso a este espacio.')).toBeVisible();
  await bea.reload();
  await expect(bea.getByRole('heading', { name: 'Espacio no encontrado' })).toBeVisible();
});

test('sin invitación no se puede entrar a un espacio ajeno', async () => {
  const ana = await newBrowserPage();
  await signIn(ana, uniqueEmail('ana'));
  await completeProfile(ana, 'Ana');
  const spaceId = await createSpace(ana, 'Privado');

  const intruso = await newBrowserPage();
  // Sin sesión: va al login.
  await intruso.goto(new URL(`s/${spaceId}`, BASE_URL).toString());
  await expect(intruso.getByRole('button', { name: 'Enviarme un enlace' })).toBeVisible();
  // Con sesión, pero sin ser miembro: no lo ve.
  await signIn(intruso, uniqueEmail('intruso'), `/s/${spaceId}`);
  await completeProfile(intruso, 'Intruso');
  await expect(intruso.getByRole('heading', { name: 'Espacio no encontrado' })).toBeVisible();
});

test('al volver a un espacio apareces donde lo dejaste', async () => {
  const ana = await newBrowserPage();
  await signIn(ana, uniqueEmail('ana'));
  await completeProfile(ana, 'Ana');
  await createSpace(ana, 'Oficina');
  await enterSpace(ana);
  const target = { x: 22, y: 16 };
  await walkTo(ana, target.x, target.y);

  await ana.getByRole('button', { name: 'Salir' }).click();
  await expect(ana.getByRole('heading', { name: 'Mis espacios' })).toBeVisible();
  await ana.getByRole('link', { name: /Oficina/ }).click();
  await enterSpace(ana);
  await expect.poll(async () => (await snapshot(ana)).tile).toEqual(target);
});
