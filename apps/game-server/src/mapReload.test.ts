import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientMessage,
  ServerMessage,
  WORLD_ROOM,
  type BoardErrorMessage,
  type ObjectContentsMessage,
} from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { tiledFromAscii } from '@pixels/shared/testing';
import { handleSpaceEvent } from './rooms/WorldRoom.js';
import { createGameServer } from './server.js';
import { MemorySpaceStore } from './store.js';

const TICKET_SECRET = 'secreto-de-prueba';
const SPACE = 'space-reload';
let fakeNow = 0;

const BEFORE = tiledFromAscii(
  ['#########', '#S......#', '#.......#', '#.......#', '#########'],
  16,
  [],
  [{ name: 'Pizarra', x: 1, y: 0, width: 2, height: 1 }],
  [{ name: 'Nota', type: 'note', x: 6, y: 0, width: 1, height: 1, value: 'Antes' }],
);
// Después: pared donde estaba el inicio, sin pizarra y con una nota nueva.
const AFTER = tiledFromAscii(
  ['#########', '##......#', '#.S.....#', '#.......#', '#########'],
  16,
  [],
  [],
  [
    { name: 'Nota', type: 'note', x: 6, y: 0, width: 1, height: 1, value: 'Antes' },
    { name: 'Nota nueva', type: 'note', x: 4, y: 0, width: 1, height: 1, value: 'Nueva' },
  ],
);

const store = new MemorySpaceStore();
const PORT = 25674;
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
      { uid: `user-${name}`, space: SPACE, name, avatar: 0, role: 'owner', exp: fakeNow + 60_000 },
      TICKET_SECRET,
    ),
  });
  rooms.push(room);
  return room;
}

beforeAll(async () => {
  await server.listen(PORT, '127.0.0.1');
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

beforeEach(async () => {
  fakeNow += 10_000;
  await Promise.all(rooms.splice(0).map((r) => r.leave().catch(() => {})));
  await new Promise((r) => setTimeout(r, 50));
  store.maps.set(SPACE, BEFORE);
  store.positions.clear();
  store.objects.clear();
});

describe('publicar un mapa nuevo con gente dentro', () => {
  it('se usa al momento: recoloca, cierra lo que ya no está y avisa a los clientes', async () => {
    const ana = await join('Ana');
    const changed: unknown[] = [];
    const contents: ObjectContentsMessage[] = [];
    const errors: BoardErrorMessage[] = [];
    ana.onMessage(ServerMessage.MapChanged, (m: unknown) => changed.push(m));
    ana.onMessage(ServerMessage.ObjectContents, (m: ObjectContentsMessage) => contents.push(m));
    ana.onMessage(ServerMessage.BoardError, (m: BoardErrorMessage) => errors.push(m));
    ana.send(ClientMessage.BoardOpen, { boardId: 'board-1' });
    await new Promise((r) => setTimeout(r, 100));

    store.maps.set(SPACE, AFTER);
    handleSpaceEvent({ type: 'map-updated', spaceId: SPACE });

    await expect.poll(() => changed.length).toBe(1);
    // Ana estaba en (1,1), que ahora es pared: pasa a la casilla libre más cercana.
    const me = ana.state.players.get(ana.sessionId) as { x: number; y: number };
    await expect.poll(() => [me.x, me.y]).not.toEqual([1, 1]);
    expect(Math.abs(me.x - 1) + Math.abs(me.y - 1)).toBe(1);
    // La pizarra desapareció: se le cierra.
    expect(errors.at(-1)).toMatchObject({ boardId: 'board-1', closed: true });
    // La nota nueva llega con su contenido inicial.
    expect(contents.at(-1)!.contents).toEqual({ 'obj-1': 'Antes', 'obj-2': 'Nueva' });

    // Y las paredes nuevas cuentan: hacia arriba desde (1,2) hay pared.
    ana.send(ClientMessage.Step, { dir: 'up', seq: 1 });
    await expect.poll(() => (ana.state.players.get(ana.sessionId) as { seq: number }).seq).toBe(1);
    expect(me.y).not.toBe(1);
  });

  it('si el mapa nuevo no se puede leer, la sala sigue con el de antes', async () => {
    const ana = await join('Ana');
    const changed: unknown[] = [];
    ana.onMessage(ServerMessage.MapChanged, (m: unknown) => changed.push(m));
    store.maps.set(SPACE, { ...BEFORE, layers: [] });
    handleSpaceEvent({ type: 'map-updated', spaceId: SPACE });
    await new Promise((r) => setTimeout(r, 150));
    expect(changed).toHaveLength(0);
    ana.send(ClientMessage.Step, { dir: 'right', seq: 1 });
    await expect.poll(() => (ana.state.players.get(ana.sessionId) as { x: number }).x).toBe(2);
  });
});
