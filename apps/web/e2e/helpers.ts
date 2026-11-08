import { chromium, expect, type Browser, type Page } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173/';

/** WebGL por software y cámara/micrófono simulados (sin pedir permiso). */
export const LAUNCH = {
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
};

const browsers: Browser[] = [];

export async function closeBrowsers() {
  await Promise.all(browsers.splice(0).map((b) => b.close()));
}

/**
 * Entra al mundo. Cada jugador abre su propio navegador. (Con WebGL por software, dos páginas del mismo
 * navegador comparten el proceso de GPU y la segunda se bloquea; con GPU real no pasa.)
 */
export async function joinAs(
  name: string,
  avatar = 1,
  { camera = false }: { camera?: boolean } = {},
): Promise<Page> {
  const browser = await chromium.launch(LAUNCH);
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE_URL);
  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('radio', { name: `Avatar ${avatar}` }).check();
  // Sin cámara ni micrófono por defecto: decodificar video sin GPU baja mucho los FPS.
  if (!camera) {
    await page.getByRole('button', { name: 'Apagar micrófono' }).click();
    await page.getByRole('button', { name: 'Apagar cámara' }).click();
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => (window.__pixels?.snapshot()?.players.length ?? 0) >= 1, null, {
    polling: 100,
  });
  return page;
}

export const snapshot = (page: Page) => page.evaluate(() => window.__pixels!.snapshot()!);
export const media = (page: Page) => page.evaluate(() => window.__pixels!.media());

export async function positionOf(page: Page, id: string) {
  const s = await snapshot(page);
  return s.players.find((p) => p.id === id) ?? null;
}

/** Camina hasta una casilla (como un clic en el mapa) y espera a llegar. */
export async function walkTo(page: Page, x: number, y: number) {
  expect(await page.evaluate(([tx, ty]) => window.__pixels!.walkTo(tx, ty), [x, y] as const)).toBe(
    true,
  );
  await expect.poll(async () => (await snapshot(page)).tile, { timeout: 20_000 }).toEqual({ x, y });
}
