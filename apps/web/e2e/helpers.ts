import { chromium, expect, type Browser, type Page } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173/';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
/** Mailpit (docker compose): ahí llegan los correos con los enlaces de login. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

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
/** Espacio de la prueba en curso: lo crea el primer jugador y los demás entran por invitación. */
let current: { spaceId: string; invite: string } | null = null;

export async function closeBrowsers() {
  current = null;
  await Promise.all(browsers.splice(0).map((b) => b.close()));
}

/**
 * Abre un navegador nuevo (cada jugador el suyo). Con WebGL por software, dos páginas del mismo
 * navegador comparten el proceso de GPU y la segunda se bloquea; con GPU real no pasa.
 */
export async function newBrowserPage(): Promise<Page> {
  const browser = await chromium.launch(LAUNCH);
  browsers.push(browser);
  return browser.newPage({ viewport: { width: 1280, height: 800 } });
}

/** Correo único por prueba: cada ejecución usa cuentas nuevas. */
export const uniqueEmail = (name: string) =>
  `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.test`;

interface MailpitSearch {
  messages: { ID: string }[];
}

/** Espera el correo de login de `email` en Mailpit y devuelve el enlace. */
export async function magicLinkFor(email: string): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const search = (await (
          await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
        ).json()) as MailpitSearch;
        const id = search.messages[0]?.ID;
        if (!id) return null;
        const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
          Text: string;
        };
        link = message.Text.match(/https?:\/\/\S+/)?.[0] ?? null;
        return link;
      },
      { timeout: 15_000, message: `No llegó el correo a ${email} (¿está Mailpit en marcha?)` },
    )
    .not.toBeNull();
  return link!;
}

/** Inicia sesión con enlace mágico (pidiéndolo en la web y abriéndolo desde Mailpit). */
export async function signIn(page: Page, email: string, next = '/') {
  await page.goto(new URL(`login?next=${encodeURIComponent(next)}`, BASE_URL).toString());
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
  await expect(page.getByText('Te enviamos un enlace')).toBeVisible();
  await page.goto(await magicLinkFor(email));
}

/** Rellena el perfil la primera vez (nombre y avatar). */
export async function completeProfile(page: Page, name: string, avatar = 1) {
  await expect(page.getByRole('heading', { name: 'Elige cómo te verán' })).toBeVisible();
  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('radio', { name: `Avatar ${avatar}` }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

/** Desde «Mis espacios», crea un espacio y espera a estar en su página. */
export async function createSpace(page: Page, name: string): Promise<string> {
  await page.getByLabel('Nombre del espacio').fill(name);
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.waitForURL(/\/s\/[^/]+$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

/** Pulsa «Entrar» en la pantalla previa y espera a ver el mapa. */
export async function enterSpace(page: Page, { camera = false }: { camera?: boolean } = {}) {
  // Sin cámara ni micrófono por defecto: decodificar video sin GPU baja mucho los FPS.
  // (La preferencia se recuerda: al volver a entrar pueden estar ya apagados.)
  if (!camera) {
    for (const device of ['micrófono', 'cámara']) {
      const toggle = page.getByRole('button', { name: new RegExp(`(Apagar|Encender) ${device}`) });
      if ((await toggle.getAttribute('aria-label'))?.startsWith('Apagar')) await toggle.click();
    }
  }
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForFunction(() => (window.__pixels?.snapshot()?.players.length ?? 0) >= 1, null, {
    polling: 100,
  });
}

/**
 * Entra al mundo como una persona nueva. El primer jugador de cada prueba crea el espacio; los
 * siguientes entran con un enlace de invitación (creado por la API para ir más rápido; la prueba
 * de cuentas lo hace desde la interfaz).
 */
export async function joinAs(
  name: string,
  avatar = 1,
  { camera = false }: { camera?: boolean } = {},
): Promise<Page> {
  const page = await newBrowserPage();
  if (!current) {
    await signIn(page, uniqueEmail(name));
    await completeProfile(page, name, avatar);
    const spaceId = await createSpace(page, `Prueba ${Date.now()}`);
    // page.request comparte las cookies de la página: la petición va con la sesión.
    const res = await page.request.post(`${API_URL}/spaces/${spaceId}/invites`, {
      data: { role: 'member', days: 1 },
    });
    expect(res.ok()).toBe(true);
    const { token } = (await res.json()) as { token: string };
    current = { spaceId, invite: token };
  } else {
    const invite = `/i/${current.invite}`;
    await signIn(page, uniqueEmail(name), invite);
    await page.getByRole('button', { name: 'Unirme al espacio' }).click();
    await completeProfile(page, name, avatar);
    await page.waitForURL(new RegExp(`/s/${current.spaceId}$`));
  }
  await enterSpace(page, { camera });
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
