import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientMessage,
  ServerMessage,
  WORLD_ROOM,
  type ObjectContentMessage,
  type ObjectContentsMessage,
  type ObjectErrorMessage,
  type Role,
  type RoleChangedMessage,
} from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { tiledFromAscii } from '@pixels/shared/testing';
import { handleSpaceEvent } from './rooms/WorldRoom.js';
import { createGameServer } from './server.js';
import { MemorySpaceStore } from './store.js';

const TICKET_SECRET = 'secreto-de-prueba';
const SPACE = 'space-objects';
let fakeNow = 0;

// Nota, enlace y video en la pared de arriba; mesa de juego abajo.
const store = new MemorySpaceStore();
store.maps.set(
  SPACE,
  tiledFromAscii(
    ['##########', '#S.......#', '#........#', '#....##..#', '##########'],
    16,
    [],
    [],
    [
      { name: 'Tablón', type: 'note', x: 1, y: 0, width: 2, height: 1, value: 'Hola' },
      { name: 'Web', type: 'link', x: 4, y: 0, width: 1, height: 1 },
      { name: 'Tele', type: 'video', x: 6, y: 0, width: 2, height: 1 },
      { name: 'Mesa', type: 'game', x: 5, y: 3, width: 2, height: 1 },
    ],
  ),
);
const NOTE = 'obj-1';
const LINK = 'obj-2';
const VIDEO = 'obj-3';
const GAME = 'obj-4';

const PORT = 25672;
const server = createGameServer({
  corsOrigin: 'http://localhost:5173',
  store,
  ticketSecret: TICKET_SECRET,
  maxClients: 25,
  now: () => fakeNow,
});

interface Inbox {
  contents: ObjectContentsMessage[];
  changes: ObjectContentMessage[];
  errors: ObjectErrorMessage[];
  roles: RoleChangedMessage[];
}

const rooms: Room[] = [];
async function join(name: string, role: Role) {
  const room = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate(WORLD_ROOM, {
    spaceId: SPACE,
    ticket: signJoinTicket(
      { uid: `user-${name}`, space: SPACE, name, avatar: 0, role, exp: fakeNow + 60_000 },
      TICKET_SECRET,
    ),
  });
  rooms.push(room);
  const inbox: Inbox = { contents: [], changes: [], errors: [], roles: [] };
  room.onMessage(ServerMessage.ObjectContents, (m: ObjectContentsMessage) =>
    inbox.contents.push(m),
  );
  room.onMessage(ServerMessage.ObjectContent, (m: ObjectContentMessage) => inbox.changes.push(m));
  room.onMessage(ServerMessage.ObjectError, (m: ObjectErrorMessage) => inbox.errors.push(m));
  room.onMessage(ServerMessage.RoleChanged, (m: RoleChangedMessage) => inbox.roles.push(m));
  await expect.poll(() => inbox.contents.length).toBe(1);
  return { room, inbox };
}

const edit = (who: Awaited<ReturnType<typeof join>>, objectId: string, value: unknown) =>
  who.room.send(ClientMessage.ObjectEdit, { objectId, value });

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
  store.objects.clear();
});

describe('objetos del mapa', () => {
  it('al entrar llega el contenido de los objetos (el del mapa si nadie lo cambió)', async () => {
    const ana = await join('Ana', 'member');
    expect(ana.inbox.contents[0]!.contents).toEqual({ [NOTE]: 'Hola', [LINK]: '', [VIDEO]: '' });
  });

  it('el dueño y los admins cambian notas, enlaces y videos, y todos lo reciben', async () => {
    const olga = await join('Olga', 'owner');
    const adri = await join('Adri', 'admin');
    const bea = await join('Bea', 'member');

    edit(olga, NOTE, '  Reunión a las 10  ');
    edit(adri, LINK, 'ejemplo.com/docs');
    // Más tarde (el límite deja unos pocos cambios seguidos).
    fakeNow += 5_000;
    edit(olga, VIDEO, 'https://youtu.be/dQw4w9WgXcQ');
    await expect.poll(() => bea.inbox.changes.length).toBe(3);
    // Llegan por conexiones distintas: el orden entre Olga y Adri puede variar.
    const byId = (a: ObjectContentMessage, b: ObjectContentMessage) =>
      a.objectId.localeCompare(b.objectId);
    expect([...bea.inbox.changes].sort(byId)).toEqual([
      { objectId: NOTE, value: 'Reunión a las 10' },
      { objectId: LINK, value: 'https://ejemplo.com/docs' },
      { objectId: VIDEO, value: 'youtube:dQw4w9WgXcQ' },
    ]);
    expect(store.objects.get(SPACE)).toEqual({
      [NOTE]: 'Reunión a las 10',
      [LINK]: 'https://ejemplo.com/docs',
      [VIDEO]: 'youtube:dQw4w9WgXcQ',
    });
  });

  it('miembros e invitados no pueden, ni nadie con contenido no válido', async () => {
    const olga = await join('Olga', 'owner');
    const bea = await join('Bea', 'member');
    const gus = await join('Gus', 'guest');

    edit(bea, NOTE, 'hackeado');
    edit(gus, LINK, 'https://phishing.example');
    await expect.poll(() => bea.inbox.errors.length + gus.inbox.errors.length).toBe(2);
    expect(bea.inbox.errors[0]!.message).toMatch(/dueño y los admins/);

    edit(olga, LINK, 'javascript:alert(1)');
    edit(olga, VIDEO, 'https://ejemplo.com/video.mp4');
    await expect.poll(() => olga.inbox.errors.length).toBe(2);
    expect(olga.inbox.errors.map((e) => e.objectId)).toEqual([LINK, VIDEO]);

    // La mesa de juego no tiene contenido.
    edit(olga, GAME, 'hola');
    await pause();
    expect(olga.inbox.changes).toHaveLength(0);
    expect(store.objects.get(SPACE)).toBeUndefined();
  });

  it('lo cambiado se guarda y sigue ahí al volver a abrir la sala', async () => {
    const olga = await join('Olga', 'owner');
    edit(olga, NOTE, 'Guardado');
    await expect.poll(() => olga.inbox.changes.length).toBe(1);
    await olga.room.leave();
    await pause();
    const bea = await join('Bea', 'member');
    expect(bea.inbox.contents[0]!.contents[NOTE]).toBe('Guardado');
  });

  it('si la API cambia el rol, vale desde ya y la persona se entera', async () => {
    const bea = await join('Bea', 'member');
    handleSpaceEvent({ type: 'role-changed', spaceId: SPACE, userId: 'user-Bea', role: 'admin' });
    await expect.poll(() => bea.inbox.roles).toEqual([{ role: 'admin' }]);
    edit(bea, NOTE, 'Ahora sí');
    await expect.poll(() => bea.inbox.changes.length).toBe(1);

    handleSpaceEvent({ type: 'role-changed', spaceId: SPACE, userId: 'user-Bea', role: 'guest' });
    await expect.poll(() => bea.inbox.roles.length).toBe(2);
    fakeNow += 5_000;
    edit(bea, NOTE, 'Ya no');
    await expect.poll(() => bea.inbox.errors.length).toBe(1);
  });
});
