import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_RATE_LIMIT,
  ClientMessage,
  ServerMessage,
  STEP_BURST,
  WORLD_ROOM,
  parseWorldMap,
  type ChatEntry,
  type GameServerHealth,
  type MediaTicketMessage,
} from '@pixels/shared';
import { verifyMediaTicket } from '@pixels/shared/media-ticket';
import { tiledFromAscii } from '@pixels/shared/testing';
import { WorldRoom } from './rooms/WorldRoom.js';
import { createGameServer } from './server.js';

const TICKET_SECRET = 'secreto-de-prueba';

// Reloj controlado por las pruebas: el límite de velocidad depende del tiempo.
let fakeNow = 0;

class TestRoom extends WorldRoom {
  protected override map = parseWorldMap(
    tiledFromAscii([
      '#######', //
      '#S....#',
      '#.#...#',
      '#.....#',
      '#######',
    ]),
  );
  protected override now = () => fakeNow;
  protected override mediaTicketSecret = TICKET_SECRET;
}

const PORT = 25670;
const server = createGameServer({ corsOrigin: 'http://localhost:5173', roomClass: TestRoom });
const endpoint = `ws://127.0.0.1:${PORT}`;

interface PlayerView {
  name: string;
  avatar: number;
  x: number;
  y: number;
  dir: string;
  seq: number;
}

const rooms: Room[] = [];
async function join(name: string, extra: Record<string, unknown> = {}) {
  const room = await new Client(endpoint).joinOrCreate(WORLD_ROOM, { name, avatar: 2, ...extra });
  rooms.push(room);
  return room;
}
const playerOf = (room: Room, sessionId = room.sessionId) =>
  room.state.players?.get(sessionId) as PlayerView | undefined;

beforeAll(async () => {
  await server.listen(PORT, '127.0.0.1');
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

beforeEach(async () => {
  fakeNow += 10_000;
  await Promise.all(rooms.splice(0).map((r) => r.leave().catch(() => {})));
});

async function health(): Promise<GameServerHealth> {
  const res = await fetch(`http://127.0.0.1:${PORT}/health`);
  return (await res.json()) as GameServerHealth;
}

describe('servidor de juego', () => {
  it('responde /health', async () => {
    expect(await health()).toMatchObject({ service: 'game-server', status: 'up' });
  });

  it('dos clientes entran a la misma sala y se ven con nombre y avatar', async () => {
    const alice = await join('Alice');
    const bob = await join('  Bob  ');
    expect(bob.roomId).toBe(alice.roomId);

    await expect.poll(() => alice.state.players?.size).toBe(2);
    expect(playerOf(alice, bob.sessionId)).toMatchObject({ name: 'Bob', avatar: 2, x: 1, y: 1 });
    expect(await health()).toMatchObject({ rooms: 1, players: 2 });
  });

  it('mueve al jugador y los demás ven el cambio', async () => {
    const alice = await join('Alice');
    const bob = await join('Bob');

    alice.send(ClientMessage.Step, { dir: 'right', seq: 1 });
    await expect.poll(() => playerOf(bob, alice.sessionId)?.x).toBe(2);
    expect(playerOf(bob, alice.sessionId)).toMatchObject({ y: 1, dir: 'right', seq: 1 });
  });

  it('no deja atravesar paredes, pero confirma el paso y gira al jugador', async () => {
    const alice = await join('Alice');
    alice.send(ClientMessage.Step, { dir: 'up', seq: 1 });
    await expect.poll(() => playerOf(alice)?.seq).toBe(1);
    expect(playerOf(alice)).toMatchObject({ x: 1, y: 1, dir: 'up' });
  });

  it('ignora pasos repetidos o antiguos', async () => {
    const alice = await join('Alice');
    alice.send(ClientMessage.Step, { dir: 'right', seq: 5 });
    alice.send(ClientMessage.Step, { dir: 'right', seq: 5 });
    alice.send(ClientMessage.Step, { dir: 'right', seq: 3 });
    alice.send(ClientMessage.Step, { dir: 'right', seq: 6 });
    await expect.poll(() => playerOf(alice)?.seq).toBe(6);
    // Solo cuentan los pasos 5 y 6.
    expect(playerOf(alice)).toMatchObject({ x: 3, y: 1 });
  });

  it('frena a quien intenta moverse demasiado rápido', async () => {
    const alice = await join('Alice');
    // El reloj no avanza: solo se aceptan STEP_BURST pasos.
    for (let seq = 1; seq <= STEP_BURST + 2; seq++)
      alice.send(ClientMessage.Step, { dir: 'right', seq });
    await expect.poll(() => playerOf(alice)?.seq).toBe(STEP_BURST + 2);
    expect(playerOf(alice)?.x).toBe(1 + STEP_BURST);
  });

  it('ignora un mapa enviado por el cliente en las opciones de entrada', async () => {
    const hacker = await join('Hacker', {
      map: { width: 7, height: 5, tileSize: 16, blocked: [], spawn: { x: 1, y: 1 } },
    });
    hacker.send(ClientMessage.Step, { dir: 'up', seq: 1 });
    await expect.poll(() => playerOf(hacker)?.seq).toBe(1);
    expect(playerOf(hacker)).toMatchObject({ x: 1, y: 1 });
  });

  it('reparte el chat, limita la frecuencia y envía el historial a quien llega después', async () => {
    const alice = await join('Alice');
    const bob = await join('Bob');
    const received: ChatEntry[] = [];
    bob.onMessage(ServerMessage.Chat, (entry: ChatEntry) => received.push(entry));

    for (let i = 0; i < CHAT_RATE_LIMIT + 2; i++)
      alice.send(ClientMessage.Chat, { text: ` hola ${i} ` });
    await expect.poll(() => received.length).toBe(CHAT_RATE_LIMIT);
    expect(received[0]).toMatchObject({
      name: 'Alice',
      sessionId: alice.sessionId,
      text: 'hola 0',
    });

    const history: ChatEntry[][] = [];
    const carol = await new Client(endpoint).joinOrCreate(WORLD_ROOM, { name: 'Carol' });
    rooms.push(carol);
    carol.onMessage(ServerMessage.ChatHistory, (entries: ChatEntry[]) => history.push(entries));
    await expect.poll(() => history.length).toBe(1);
    expect(history[0]!.map((e) => e.text).slice(-2)).toEqual([
      `hola ${CHAT_RATE_LIMIT - 2}`,
      `hola ${CHAT_RATE_LIMIT - 1}`,
    ]);
  });

  it('entrega un ticket de medios firmado con la identidad del jugador y limita los repetidos', async () => {
    const tickets: string[] = [];
    const alice = await join('Alice');
    alice.onMessage(ServerMessage.MediaTicket, (m: MediaTicketMessage) => tickets.push(m.ticket));
    await expect.poll(() => tickets.length).toBe(1);

    const payload = verifyMediaTicket(tickets[0], TICKET_SECRET, fakeNow);
    expect(payload).toMatchObject({ sid: alice.sessionId, name: 'Alice' });
    expect(payload!.room).toBe(`world-${alice.roomId}`);
    expect(verifyMediaTicket(tickets[0], 'otro-secreto', fakeNow)).toBeNull();

    // Pedir otro enseguida no da nada; pasado el tiempo de espera, sí.
    alice.send(ClientMessage.MediaTicket);
    await new Promise((r) => setTimeout(r, 100));
    expect(tickets).toHaveLength(1);

    fakeNow += 5_000;
    alice.send(ClientMessage.MediaTicket);
    await expect.poll(() => tickets.length).toBe(2);
  });
});
