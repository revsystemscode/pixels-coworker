import { expect, test, type Page } from '@playwright/test';
import { closeBrowsers, joinAs, media, snapshot, walkTo } from './helpers.js';

// Necesita LiveKit en marcha (docker compose up -d livekit).
// Casillas del mapa de la oficina: aparición en (19, 16); la sala de reuniones (zona privada)
// ocupa x 1–12, y 1–7 y su puerta está en (5–6, 8).
const FAR = { x: 27, y: 16 }; // a 8 casillas de la aparición
const NEAR = { x: 21, y: 16 }; // a 2 casillas
const IN_ROOM = { x: 6, y: 6 };
const IN_ROOM_FAR = { x: 11, y: 7 }; // dentro de la sala, a más de 3 casillas de IN_ROOM
const AT_DOOR = { x: 6, y: 9 }; // fuera de la sala, a 3 casillas de IN_ROOM

test.afterEach(closeBrowsers);
test.setTimeout(150_000);

const idOf = async (page: Page) => (await snapshot(page)).selfId;

/** True si `listener` está suscrito al micrófono de `speakerId` con volumen > 0. */
async function hears(listener: Page, speakerId: string) {
  const state = await media(listener);
  const peer = state?.remote.find((p) => p.id === speakerId);
  return !!peer && peer.volume > 0 && peer.subscribed.includes('microphone');
}

/** True si `listener` recibe la cámara de `speakerId` y la muestra en su burbuja. */
async function seesVideo(listener: Page, speakerId: string) {
  return listener.locator(`[data-peer="${speakerId}"] video`).isVisible();
}

/** Quién tiene permiso para recibir las pistas de `speaker` (lo aplica LiveKit). */
async function allowed(speaker: Page) {
  return (await media(speaker))?.allowed ?? [];
}

const connected = (page: Page) =>
  expect.poll(async () => (await media(page))?.status, { timeout: 15_000 }).toBe('connected');

test('video por proximidad: cerca se oyen, lejos no y en una zona privada solo los de dentro', async () => {
  const alice = await joinAs('Alice', 1, { camera: true });
  const carol = await joinAs('Carol', 3, { camera: true });
  await Promise.all([connected(alice), connected(carol)]);
  await walkTo(carol, FAR.x, FAR.y);

  const bob = await joinAs('Bob', 2, { camera: true });
  await connected(bob);
  const [a, b, c] = await Promise.all([idOf(alice), idOf(bob), idOf(carol)]);

  // A y B, juntos: se oyen y se ven.
  await expect.poll(() => hears(alice, b), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => hears(bob, a), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => seesVideo(alice, b), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => seesVideo(bob, a), { timeout: 15_000 }).toBe(true);

  // C, lejos: no recibe nada, y A y B no le dan permiso.
  expect(await hears(carol, a)).toBe(false);
  expect(await hears(carol, b)).toBe(false);
  expect(await allowed(alice)).not.toContain(c);
  expect(await allowed(bob)).not.toContain(c);

  // C se acerca: ahora oye a los dos.
  await walkTo(carol, NEAR.x, NEAR.y);
  await expect.poll(() => hears(carol, a), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => hears(carol, b), { timeout: 15_000 }).toBe(true);

  // A entra en la sala de reuniones; B se queda en la puerta, a 3 casillas (fuera de la zona).
  await Promise.all([walkTo(alice, IN_ROOM.x, IN_ROOM.y), walkTo(bob, AT_DOOR.x, AT_DOOR.y)]);
  await expect.poll(async () => (await media(alice))?.zone).toBe('Sala de reuniones');
  await expect(alice.getByText('Sala de reuniones · privada')).toBeVisible();
  await expect.poll(() => hears(alice, b), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => hears(bob, a), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => allowed(alice), { timeout: 15_000 }).not.toContain(b);

  // B entra en la sala, lejos de A: dentro de la zona se oyen aunque estén a más de 3 casillas.
  await walkTo(bob, IN_ROOM_FAR.x, IN_ROOM_FAR.y);
  await expect.poll(() => hears(alice, b), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => hears(bob, a), { timeout: 15_000 }).toBe(true);
  // C, fuera, no oye a ninguno.
  await expect.poll(() => hears(carol, a), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => hears(carol, b), { timeout: 15_000 }).toBe(false);
});

test('silenciar el micrófono se ve en la burbuja de los demás', async () => {
  const alice = await joinAs('Alice', 1, { camera: true });
  const bob = await joinAs('Bob', 2, { camera: true });
  await Promise.all([connected(alice), connected(bob)]);
  const a = await idOf(alice);
  await expect.poll(() => seesVideo(bob, a), { timeout: 15_000 }).toBe(true);

  await alice.getByRole('button', { name: 'Silenciar micrófono' }).click();
  await expect(alice.getByRole('button', { name: 'Activar micrófono' })).toBeVisible();
  await expect(bob.locator(`[data-peer="${a}"] .bubble-muted`)).toBeVisible();

  await alice.getByRole('button', { name: 'Apagar cámara' }).click();
  await expect(bob.locator(`[data-peer="${a}"] video`)).toHaveCount(0);
  await expect(bob.locator(`[data-peer="${a}"] .bubble-initial`)).toHaveText('A');
});
