import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientMessage,
  ServerMessage,
  WHITEBOARD_MAX_ELEMENTS,
  WORLD_ROOM,
  type BoardElement,
  type BoardErrorMessage,
  type BoardRemotePointerMessage,
  type BoardSceneMessage,
  type BoardUpdateMessage,
  type BoardViewersMessage,
} from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { tiledFromAscii } from '@pixels/shared/testing';
import { createGameServer } from './server.js';
import { MemorySpaceStore } from './store.js';

const TICKET_SECRET = 'secreto-de-prueba';
const SPACE = 'space-board';
const BOARD = 'board-1';
let fakeNow = 0;

// Pizarra en la pared de arriba (x 3–5). El punto de inicio (1,1) está a 2 casillas: se puede abrir.
const store = new MemorySpaceStore();
store.maps.set(
  SPACE,
  tiledFromAscii(
    [
      '##########', //
      '#S.......#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
    16,
    [],
    [{ name: 'Pizarra', x: 3, y: 0, width: 3, height: 1 }],
  ),
);

const PORT = 25671;
const server = createGameServer({
  corsOrigin: 'http://localhost:5173',
  store,
  ticketSecret: TICKET_SECRET,
  maxClients: 25,
  now: () => fakeNow,
});

/** Mensajes de pizarra que ha recibido un cliente, por tipo. */
interface Inbox {
  scenes: BoardSceneMessage[];
  updates: BoardUpdateMessage[];
  pointers: BoardRemotePointerMessage[];
  viewers: BoardViewersMessage[];
  errors: BoardErrorMessage[];
}

const rooms: Room[] = [];
async function join(name: string) {
  const room = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate(WORLD_ROOM, {
    spaceId: SPACE,
    ticket: signJoinTicket(
      { uid: `user-${name}`, space: SPACE, name, avatar: 1, role: 'member', exp: fakeNow + 60_000 },
      TICKET_SECRET,
    ),
  });
  rooms.push(room);
  const inbox: Inbox = { scenes: [], updates: [], pointers: [], viewers: [], errors: [] };
  room.onMessage(ServerMessage.BoardScene, (m: BoardSceneMessage) => inbox.scenes.push(m));
  room.onMessage(ServerMessage.BoardUpdate, (m: BoardUpdateMessage) => inbox.updates.push(m));
  room.onMessage(ServerMessage.BoardPointer, (m: BoardRemotePointerMessage) =>
    inbox.pointers.push(m),
  );
  room.onMessage(ServerMessage.BoardViewers, (m: BoardViewersMessage) => inbox.viewers.push(m));
  room.onMessage(ServerMessage.BoardError, (m: BoardErrorMessage) => inbox.errors.push(m));
  return { room, inbox };
}

async function openBoard(who: Awaited<ReturnType<typeof join>>, boardId = BOARD) {
  const before = who.inbox.scenes.length;
  who.room.send(ClientMessage.BoardOpen, { boardId });
  await expect.poll(() => who.inbox.scenes.length).toBe(before + 1);
  return who.inbox.scenes.at(-1)!.elements;
}

const element = (id: string, version = 1, over: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version,
  versionNonce: 100,
  isDeleted: false,
  ...over,
});

const update = (who: Awaited<ReturnType<typeof join>>, elements: BoardElement[]) =>
  who.room.send(ClientMessage.BoardUpdate, { boardId: BOARD, elements });

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
  // Espera a que la sala se cierre y guarde, para empezar de cero.
  await pause(50);
  store.boards.clear();
  store.positions.clear();
});

describe('pizarra', () => {
  it('solo se abre desde cerca', async () => {
    const ana = await join('Ana');
    // Baja dos casillas: queda a 3 de la pizarra.
    ana.room.send(ClientMessage.Step, { dir: 'down', seq: 1 });
    ana.room.send(ClientMessage.Step, { dir: 'down', seq: 2 });
    await pause();
    ana.room.send(ClientMessage.BoardOpen, { boardId: BOARD });
    await expect.poll(() => ana.inbox.errors.length).toBe(1);
    expect(ana.inbox.errors[0]).toMatchObject({ boardId: BOARD, closed: true });
    expect(ana.inbox.errors[0]!.message).toMatch(/Acércate/);
    expect(ana.inbox.scenes).toHaveLength(0);

    // Una pizarra que no existe tampoco.
    ana.room.send(ClientMessage.BoardOpen, { boardId: 'board-99' });
    await expect.poll(() => ana.inbox.errors.length).toBe(2);
  });

  it('reparte los cambios a quien la tiene abierta, sin devolvérselos al autor', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    const carla = await join('Carla');
    expect(await openBoard(ana)).toEqual([]);
    expect(await openBoard(bea)).toEqual([]);
    await expect
      .poll(() => ana.inbox.viewers.at(-1)?.viewers.map((v) => v.name))
      .toEqual(['Ana', 'Bea']);

    update(ana, [element('r1')]);
    await expect.poll(() => bea.inbox.updates.length).toBe(1);
    expect(bea.inbox.updates[0]).toEqual({ boardId: BOARD, elements: [element('r1')] });
    await pause();
    expect(ana.inbox.updates).toHaveLength(0);
    // Carla no tiene la pizarra abierta.
    expect(carla.inbox.updates).toHaveLength(0);

    // Quien la abre después recibe lo que hay.
    expect(await openBoard(carla)).toEqual([element('r1')]);
  });

  it('si dos cambian lo mismo, gana la versión más alta y se corrige al que iba atrasado', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await openBoard(ana);
    await openBoard(bea);

    update(ana, [element('r1', 3, { x: 30 })]);
    await expect.poll(() => bea.inbox.updates.length).toBe(1);
    // Bea envía una versión vieja: no se reparte y a ella le llega la buena.
    update(bea, [element('r1', 2, { x: 20 })]);
    await expect.poll(() => bea.inbox.updates.length).toBe(2);
    expect(bea.inbox.updates[1]!.elements).toEqual([element('r1', 3, { x: 30 })]);
    await pause();
    expect(ana.inbox.updates).toHaveLength(0);
  });

  it('descarta elementos no válidos y no deja enviar sin tener la pizarra abierta', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await openBoard(bea);

    // Ana no la ha abierto.
    update(ana, [element('r1')]);
    await pause();
    expect(bea.inbox.updates).toHaveLength(0);

    await openBoard(ana);
    update(ana, [element('img', 1, { type: 'image' as never }), element('ok')]);
    await expect.poll(() => bea.inbox.updates.length).toBe(1);
    expect(bea.inbox.updates[0]!.elements.map((e) => e.id)).toEqual(['ok']);
  });

  it('reparte el puntero con el id de la sesión', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await openBoard(ana);
    await openBoard(bea);
    ana.room.send(ClientMessage.BoardPointer, {
      boardId: BOARD,
      x: 5,
      y: 6,
      tool: 'pointer',
      button: 'up',
    });
    await expect.poll(() => bea.inbox.pointers.length).toBe(1);
    expect(bea.inbox.pointers[0]).toMatchObject({ sessionId: ana.room.sessionId, x: 5, y: 6 });
    expect(ana.inbox.pointers).toHaveLength(0);
  });

  it('guarda al cerrarla la última persona y lo recupera al volver (sin los borrados)', async () => {
    const ana = await join('Ana');
    await openBoard(ana);
    update(ana, [element('r1'), element('r2'), element('r3', 2, { isDeleted: true })]);
    await pause();
    ana.room.send(ClientMessage.BoardClose);
    await expect
      .poll(() => store.boards.get(`${SPACE}/${BOARD}`)?.map((e) => e.id))
      .toEqual(['r1', 'r2', 'r3']);

    // Todos salen: la sala se cierra. Al volver, la pizarra sigue ahí.
    await ana.room.leave();
    await pause();
    const again = await join('Ana');
    expect((await openBoard(again)).map((e) => e.id)).toEqual(['r1', 'r2']);
  });

  it('guarda al cerrarse la sala aunque alguien la tuviera abierta', async () => {
    const ana = await join('Ana');
    await openBoard(ana);
    update(ana, [element('r1')]);
    await pause();
    await ana.room.leave();
    await expect
      .poll(() => store.boards.get(`${SPACE}/${BOARD}`)?.map((e) => e.id))
      .toEqual(['r1']);
  });

  it('cuando está llena, avisa y vuelve a sincronizar a quien no cupo', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await openBoard(ana);
    await openBoard(bea);
    const many = Array.from({ length: WHITEBOARD_MAX_ELEMENTS }, (_, i) => element(`e${i}`));
    for (let i = 0; i < many.length; i += 500) update(ana, many.slice(i, i + 500));
    await expect
      .poll(() => bea.inbox.updates.flatMap((u) => u.elements).length)
      .toBe(WHITEBOARD_MAX_ELEMENTS);

    update(bea, [element('extra'), element('e0', 2, { isDeleted: true })]);
    await expect.poll(() => bea.inbox.errors.length).toBe(1);
    expect(bea.inbox.errors[0]).toMatchObject({ closed: false });
    expect(bea.inbox.errors[0]!.message).toMatch(/llena/);
    // Le llega la pizarra completa: sin «extra», pero con el borrado (borrar siempre se puede).
    const scene = bea.inbox.scenes.at(-1)!.elements;
    expect(scene).toHaveLength(WHITEBOARD_MAX_ELEMENTS);
    expect(scene.find((e) => e.id === 'e0')?.isDeleted).toBe(true);
  });

  it('se cierra si te alejas, y al salir de la sala dejas de aparecer como presente', async () => {
    const ana = await join('Ana');
    const bea = await join('Bea');
    await openBoard(ana);
    await openBoard(bea);

    ana.room.send(ClientMessage.Step, { dir: 'down', seq: 1 });
    ana.room.send(ClientMessage.Step, { dir: 'down', seq: 2 });
    await expect.poll(() => ana.inbox.errors.length).toBe(1);
    expect(ana.inbox.errors[0]).toMatchObject({ closed: true });
    await expect.poll(() => bea.inbox.viewers.at(-1)?.viewers.map((v) => v.name)).toEqual(['Bea']);

    // Ya no recibe cambios.
    update(bea, [element('r1')]);
    await pause();
    expect(ana.inbox.updates).toHaveLength(0);
  });
});
