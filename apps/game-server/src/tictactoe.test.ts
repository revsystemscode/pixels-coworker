import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientMessage,
  ServerMessage,
  WORLD_ROOM,
  type GameErrorMessage,
  type GameStateMessage,
} from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { tiledFromAscii } from '@pixels/shared/testing';
import { createGameServer } from './server.js';
import { MemorySpaceStore } from './store.js';

const TICKET_SECRET = 'secreto-de-prueba';
const SPACE = 'space-game';
let fakeNow = 0;

// Mesa en (3,1)–(4,1). El inicio (1,1) está a 2 casillas: se puede abrir desde ahí.
const store = new MemorySpaceStore();
store.maps.set(
  SPACE,
  tiledFromAscii(
    ['#########', '#S.##...#', '#.......#', '#.......#', '#.......#', '#########'],
    16,
    [],
    [],
    [{ name: 'Mesa', type: 'game', x: 3, y: 1, width: 2, height: 1 }],
  ),
);
const TABLE = 'obj-1';

const PORT = 25673;
const server = createGameServer({
  corsOrigin: 'http://localhost:5173',
  store,
  ticketSecret: TICKET_SECRET,
  maxClients: 25,
  now: () => fakeNow,
});

const rooms: Room[] = [];
async function join(name: string) {
  const room = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate(WORLD_ROOM, {
    spaceId: SPACE,
    ticket: signJoinTicket(
      { uid: `user-${name}`, space: SPACE, name, avatar: 0, role: 'member', exp: fakeNow + 60_000 },
      TICKET_SECRET,
    ),
  });
  rooms.push(room);
  const states: GameStateMessage[] = [];
  const errors: GameErrorMessage[] = [];
  room.onMessage(ServerMessage.GameState, (m: GameStateMessage) => states.push(m));
  room.onMessage(ServerMessage.GameError, (m: GameErrorMessage) => errors.push(m));
  const last = () => states.at(-1);
  return { room, states, errors, last };
}
type Player = Awaited<ReturnType<typeof join>>;

const send = (p: Player, type: string, message?: object) => p.room.send(type, message);
async function open(p: Player) {
  send(p, ClientMessage.GameOpen, { objectId: TABLE });
  await expect.poll(() => p.last()?.objectId).toBe(TABLE);
}
const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await server.listen(PORT, '127.0.0.1');
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

beforeEach(async () => {
  fakeNow += 10_000;
  await Promise.all(rooms.splice(0).map((r) => r.leave().catch(() => {})));
  await pause(50);
  store.positions.clear();
});

describe('tres en raya', () => {
  it('dos juegan una partida completa y quien mira la ve', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    const carla = await join('Carla');
    for (const p of [ana, bea, carla]) await open(p);
    send(ana, ClientMessage.GameSit);
    await expect.poll(() => carla.last()?.seats.X?.name).toBe('Ana');
    send(bea, ClientMessage.GameSit);
    await expect.poll(() => carla.last()?.seats.O?.name).toBe('Bea');
    expect(carla.last()).toMatchObject({ seats: { X: { name: 'Ana' } }, turn: 'X', watching: 3 });

    // Carla no puede sentarse ni jugar.
    send(carla, ClientMessage.GameSit);
    await expect.poll(() => carla.errors.at(-1)?.message).toMatch(/dos personas/);

    // Ana gana con la fila de arriba.
    for (const [who, cell] of [
      [ana, 0],
      [bea, 3],
      [ana, 1],
      [bea, 4],
      [ana, 2],
    ] as const) {
      send(who, ClientMessage.GameMove, { cell });
      await pause(30);
    }
    await expect.poll(() => carla.last()?.outcome).toEqual({ winner: 'X', line: [0, 1, 2] });
    expect(carla.last()!.board).toEqual(['X', 'X', 'X', 'O', 'O', null, null, null, null]);

    // Revancha: empieza O.
    send(bea, ClientMessage.GameRematch);
    await expect.poll(() => ana.last()?.outcome).toBeNull();
    expect(ana.last()).toMatchObject({ turn: 'O', board: Array(9).fill(null) });
  });

  it('rechaza jugadas fuera de turno, en casillas ocupadas y de quien no está sentado', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await open(ana);
    await open(bea);
    send(ana, ClientMessage.GameSit);
    await expect.poll(() => bea.last()?.seats.X?.name).toBe('Ana');
    send(bea, ClientMessage.GameSit);
    await expect.poll(() => ana.last()?.seats.O?.name).toBe('Bea');

    send(bea, ClientMessage.GameMove, { cell: 0 });
    await expect.poll(() => bea.errors.at(-1)?.message).toMatch(/turno/);
    send(ana, ClientMessage.GameMove, { cell: 4 });
    await expect.poll(() => bea.last()?.board[4]).toBe('X');
    send(bea, ClientMessage.GameMove, { cell: 4 });
    await expect.poll(() => bea.errors.at(-1)?.message).toMatch(/ocupada/);
    send(bea, ClientMessage.GameMove, { cell: 42 });
    await pause();
    expect(bea.last()!.board.filter(Boolean)).toHaveLength(1);
  });

  it('solo se abre desde cerca, y al alejarse se cierra y se deja el asiento', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await open(ana);
    await open(bea);
    send(ana, ClientMessage.GameSit);
    await expect.poll(() => bea.last()?.seats.X?.name).toBe('Ana');
    send(bea, ClientMessage.GameSit);
    await expect.poll(() => ana.last()?.seats.O?.name).toBe('Bea');
    send(ana, ClientMessage.GameMove, { cell: 0 });
    await expect.poll(() => bea.last()?.board[0]).toBe('X');

    // Ana baja tres casillas: queda a más de 2 de la mesa.
    for (let seq = 1; seq <= 3; seq++) send(ana, ClientMessage.Step, { dir: 'down', seq });
    await expect.poll(() => ana.errors.at(-1)).toMatchObject({ closed: true });
    // Bea ve el asiento libre y la partida vacía.
    await expect.poll(() => bea.last()?.seats.X).toBeNull();
    expect(bea.last()).toMatchObject({ board: Array(9).fill(null), watching: 1 });

    // Desde lejos no se puede abrir.
    send(ana, ClientMessage.GameOpen, { objectId: TABLE });
    await expect.poll(() => ana.errors.length).toBe(2);
    expect(ana.errors[1]!.message).toMatch(/Acércate/);
  });

  it('al salir de la sala se deja el asiento', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await open(ana);
    await open(bea);
    send(ana, ClientMessage.GameSit);
    await expect.poll(() => bea.last()?.seats.X?.name).toBe('Ana');
    await ana.room.leave();
    await expect.poll(() => bea.last()?.seats.X).toBeNull();
  });
});
