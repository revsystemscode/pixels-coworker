import { expect, test } from '@playwright/test';
import { closeBrowsers, joinAs, walkTo } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(120_000);

const NOTE = 'Tablón de anuncios';
const VIDEO = 'Pantalla de la cocina';
const LINK = 'Enlace del equipo';

test('la dueña cambia la nota, el video y el enlace; un miembro los ve pero no los edita', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);

  // Tablón de anuncios (pared de la oficina, x 2–3). Se abre con E y trae el texto del mapa.
  await walkTo(ana, 3, 12);
  await ana.keyboard.press('e');
  const note = ana.getByRole('dialog', { name: NOTE });
  await expect(note).toContainText('¡Bienvenidos a la oficina!');
  await note.getByRole('button', { name: 'Editar' }).click();
  await note.getByLabel('Texto de la nota').fill('Reunión a las 10\nTraed ideas');
  await note.getByRole('button', { name: 'Guardar' }).click();
  await expect(note).toContainText('Reunión a las 10');
  await expect(note.getByRole('button', { name: 'Editar' })).toBeVisible();

  // Bea la abre con el botón: ve el texto nuevo y no puede editarla.
  await walkTo(bea, 2, 12);
  await bea.getByRole('button', { name: `Abrir «${NOTE}» E` }).click();
  const beaNote = bea.getByRole('dialog', { name: NOTE });
  await expect(beaNote).toContainText('Traed ideas');
  await expect(beaNote.getByRole('button', { name: 'Editar' })).toHaveCount(0);

  // Si Ana se aleja, el panel se cierra solo.
  await walkTo(ana, 19, 4);
  await expect(note).toBeHidden();

  // Pantalla de la cocina: un enlace de YouTube se ve en el reproductor sin cookies.
  await ana.keyboard.press('e');
  const video = ana.getByRole('dialog', { name: VIDEO });
  await expect(video).toContainText('Todavía no hay ningún video');
  await video.getByRole('button', { name: 'Editar' }).click();
  const field = video.getByLabel('Enlace de YouTube o Vimeo');
  await field.fill('https://ejemplo.com/video.mp4');
  await video.getByRole('button', { name: 'Guardar' }).click();
  await expect(video.getByRole('alert')).toContainText('YouTube o de Vimeo');
  await field.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await video.getByRole('button', { name: 'Guardar' }).click();
  await expect(video.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  await video.getByRole('button', { name: 'Cerrar' }).click();

  // Enlace del equipo: se guarda con https y se abre en otra pestaña.
  await walkTo(ana, 27, 12);
  await ana.keyboard.press('e');
  const link = ana.getByRole('dialog', { name: LINK });
  await link.getByRole('button', { name: 'Editar' }).click();
  await link.getByLabel('Dirección web').fill('ejemplo.com/equipo');
  await link.getByRole('button', { name: 'Guardar' }).click();
  const open = link.getByRole('link', { name: 'Abrir enlace' });
  await expect(open).toHaveAttribute('href', 'https://ejemplo.com/equipo');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', /noopener/);

  // Bea también ve el enlace nuevo.
  await bea.keyboard.press('Escape');
  await expect(beaNote).toBeHidden();
  await walkTo(bea, 28, 12);
  await bea.keyboard.press('e');
  await expect(
    bea.getByRole('dialog', { name: LINK }).getByRole('link', { name: 'Abrir enlace' }),
  ).toHaveAttribute('href', 'https://ejemplo.com/equipo');
  if (process.env.E2E_SCREENSHOTS)
    await bea.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/link.png` });
});
