import { expect, test } from '@playwright/test';
import { HAIR_COLORS, SHIRT_COLORS, encodeAvatar } from '@pixels/shared';
import { closeBrowsers, joinAs, snapshot } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(90_000);

test('los colores elegidos en el perfil se ven en el mapa', async () => {
  // Ana: personaje 1 con camiseta azul y pelo rubio. Bea: personaje 4, colores originales.
  const ana = await joinAs('Ana', 1, { colors: { Camiseta: 'Azul', Pelo: 'Rubio' } });
  const bea = await joinAs('Bea', 4);
  const expected = encodeAvatar({
    base: 0,
    shirt: SHIRT_COLORS.findIndex((c) => c.name === 'Azul') + 1,
    hair: HAIR_COLORS.findIndex((c) => c.name === 'Rubio') + 1,
    skin: 0,
  });

  const anaId = (await snapshot(ana)).selfId;
  await expect
    .poll(async () => (await snapshot(bea)).players.find((p) => p.id === anaId)?.avatar)
    .toBe(expected);
  // El sprite de Ana en el navegador de Bea es de verdad azul: se mira un píxel de la camiseta.
  const shirt = await bea.evaluate((id) => {
    const scene = window.__pixels!.game.scene.getScene('world');
    const look = window.__pixels!.snapshot()!.players.find((p) => p.id === id)!.avatar;
    const canvas = scene.textures.get(`look-${look}`).getSourceImage() as HTMLCanvasElement;
    // Frame "quieto mirando abajo" (columna 1), torso.
    const [r, g, b] = canvas.getContext('2d')!.getImageData(16 + 7, 11, 1, 1).data;
    return [r, g, b];
  }, anaId);
  expect(shirt).toEqual([0x4f, 0x86, 0xd9]);
  if (process.env.E2E_SCREENSHOTS) {
    await bea.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/avatar-map.png` });
  }
});
