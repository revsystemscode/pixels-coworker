import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { closeBrowsers, joinAs, media, snapshot, waitForScene, walkTo } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(180_000);

/** Arrastra en el lienzo del editor de la casilla `from` a la `to` (zoom 1: 16 px por casilla). */
async function drag(editor: Page, from: [number, number], to: [number, number]) {
  const box = (await editor.getByTestId('editor-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * 16 + 8, box.y + y * 16 + 8] as const;
  await editor.mouse.move(...at(from));
  await editor.mouse.down();
  await editor.mouse.move(...at(to), { steps: 8 });
  await editor.mouse.up();
}

test('una admin cambia el mapa en el editor y quien está dentro lo ve al publicar', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const spaceId = new URL(ana.url()).pathname.split('/').pop()!;
  await walkTo(bea, 20, 12);

  // Ana abre el editor en otra pestaña (desde el botón del espacio) y sigue dentro del espacio.
  const [editor] = await Promise.all([
    ana.context().waitForEvent('page'),
    ana.getByRole('link', { name: 'Editar mapa' }).click(),
  ]);
  expect(new URL(editor.url()).pathname).toBe(`/s/${spaceId}/editor`);
  await editor.setViewportSize({ width: 1440, height: 900 });
  await expect(editor.getByText('Sin cambios: es el mapa publicado')).toBeVisible();
  await editor.getByRole('button', { name: 'Alejar' }).click();

  // Una pared en la fila 16 (x 8–12).
  await editor.getByRole('button', { name: 'Pared beige' }).click();
  await drag(editor, [8, 16], [12, 16]);
  // Una zona privada (x 22–26, y 20–23) a la que se le cambia el nombre.
  await editor.getByRole('radio', { name: 'Zona privada' }).click();
  await drag(editor, [22, 20], [26, 23]);
  const name = editor.getByRole('complementary', { name: 'Propiedades' }).getByLabel('Nombre');
  await name.fill('Rincón');
  // Una pizarra sobre la cara de la pared nueva.
  await editor.getByRole('radio', { name: 'Pizarra' }).click();
  await drag(editor, [9, 17], [11, 18]);

  if (process.env.E2E_SCREENSHOTS) {
    await editor.getByRole('button', { name: 'Acercar' }).click();
    await editor.getByRole('radio', { name: 'Seleccionar' }).click();
    await editor.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/editor-edited.png` });
    await editor.getByRole('button', { name: 'Alejar' }).click();
  }
  // Se guarda solo como borrador; nadie lo ve todavía.
  await expect(editor.getByText('Borrador guardado (sin publicar)')).toBeVisible();
  expect(await bea.evaluate(() => window.__pixels!.walkTo(10, 16))).toBe(true);
  await walkTo(bea, 20, 12);

  // Exportar e importar de vuelta da el mismo mapa.
  const [download] = await Promise.all([
    editor.waitForEvent('download'),
    editor.getByRole('button', { name: 'Exportar' }).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    width: number;
    tilesets: { image: string }[];
  };
  expect(exported.width).toBe(40);
  expect(exported.tilesets[0]!.image).toBe('kenney-roguelike-base.png');
  await editor.getByLabel('Archivo de Tiled').setInputFiles((await download.path())!);
  await expect(editor.getByRole('alert')).toContainText('Mapa importado (40×26)');

  // Publicar.
  await editor.getByRole('button', { name: 'Publicar' }).click();
  await editor.getByRole('alertdialog').getByRole('button', { name: 'Publicar' }).click();
  await expect(editor.getByRole('alert')).toContainText('Mapa publicado');
  await editor.close();

  // Bea, sin salir, ve el aviso y choca con la pared nueva.
  await expect(
    bea.getByRole('status').filter({ hasText: 'Se ha actualizado el mapa' }),
  ).toBeVisible();
  await waitForScene(bea);
  expect(await bea.evaluate(() => window.__pixels!.walkTo(10, 16))).toBe(false);
  // La zona nueva es privada.
  await walkTo(bea, 24, 21);
  await expect.poll(async () => (await media(bea))?.zone).toBe('Rincón');
  await expect(bea.getByText('Rincón · privada')).toBeVisible();
  // Y la pizarra nueva se abre (Ana, desde debajo de la pared).
  await walkTo(ana, 10, 20);
  await ana.keyboard.press('e');
  await expect(ana.getByRole('dialog', { name: 'Pizarra' })).toBeVisible();
  expect((await snapshot(ana)).tile).toEqual({ x: 10, y: 20 });
});
