import { expect, test } from '@playwright/test';
import {
  MAPS,
  parseTiledForEditing,
  rebuildWalls,
  recomputeCollision,
  toTiled,
  wallGridOf,
} from '@pixels/shared';
import { API_URL, closeBrowsers, joinAs, snapshot, walkTo } from './helpers.js';

test.afterEach(closeBrowsers);
test.setTimeout(120_000);

/** La oficina con una pared nueva en la fila 16 (x 8–12). */
function officeWithWall() {
  const parsed = parseTiledForEditing(structuredClone(MAPS.office));
  if (!parsed.ok) throw new Error(parsed.error);
  const m = parsed.map;
  const grid = wallGridOf(m);
  for (let x = 8; x <= 12; x++) grid[16 * m.width + x] = 1;
  recomputeCollision(m, rebuildWalls(m, grid));
  return toTiled(m);
}

test('al publicar un mapa, quien está dentro lo ve sin salir y choca con lo nuevo', async () => {
  const ana = await joinAs('Ana', 1);
  const bea = await joinAs('Bea', 2);
  const spaceId = new URL(ana.url()).pathname.split('/').pop()!;
  await walkTo(bea, 10, 16);

  // Ana (dueña) guarda un borrador y lo publica.
  const url = `${API_URL}/spaces/${spaceId}/editor`;
  expect((await ana.request.put(`${url}/draft`, { data: { map: officeWithWall() } })).ok()).toBe(
    true,
  );
  expect((await ana.request.post(`${url}/publish`)).ok()).toBe(true);

  // Bea sigue dentro: ve el aviso y la han apartado de la pared nueva.
  await expect(
    bea.getByRole('status').filter({ hasText: 'Se ha actualizado el mapa' }),
  ).toBeVisible();
  await expect.poll(async () => (await snapshot(bea)).tile).not.toEqual({ x: 10, y: 16 });
  // Ya no se puede caminar hasta la casilla de la pared.
  expect(await bea.evaluate(() => window.__pixels!.walkTo(10, 16))).toBe(false);
  // Sigue en la misma sala (no ha tenido que volver a entrar).
  await expect(bea.getByRole('button', { name: 'Salir', exact: true })).toBeVisible();
});
