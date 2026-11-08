import { afterAll, describe, expect, it } from 'vitest';
import type { CreatedInvite, JoinSpaceResponse, SpaceSummary } from '@pixels/shared';
import { verifyJoinTicket } from '@pixels/shared/tickets';
import {
  WEB_ORIGIN,
  createTestApp,
  signIn,
  signInWithProfile,
  testMedia,
  useCleanDatabase,
} from './test-config.js';

useCleanDatabase();
const t = await createTestApp();
afterAll(() => t.app.close());

const call = (cookie: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN, cookie },
    ...(payload ? { payload } : {}),
  });

async function ownerWithSpace() {
  const owner = await signInWithProfile(t, 'owner@example.com', 'Olga', 4);
  const space = (await call(owner, 'POST', '/spaces', { name: 'Equipo' })).json<SpaceSummary>();
  return { owner, space };
}

describe('entrar a un espacio', () => {
  it('da a los miembros un ticket firmado con su identidad, nombre, avatar y rol', async () => {
    const { owner, space } = await ownerWithSpace();
    const res = await call(owner, 'POST', `/spaces/${space.id}/join`);
    expect(res.statusCode).toBe(200);
    const body = res.json<JoinSpaceResponse>();
    expect(body.space).toEqual(space);

    const payload = verifyJoinTicket(body.ticket, testMedia.ticketSecret, 1_000);
    const user = await t.db.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    expect(payload).toMatchObject({
      uid: user.id,
      space: space.id,
      name: 'Olga',
      avatar: 4,
      role: 'owner',
    });
  });

  it('no da ticket a quien no es miembro ni a quien no eligió nombre', async () => {
    const { owner, space } = await ownerWithSpace();
    const outsider = await signInWithProfile(t, 'x@example.com', 'Xavi');
    expect((await call(outsider, 'POST', `/spaces/${space.id}/join`)).statusCode).toBe(404);
    expect((await call(outsider, 'GET', `/spaces/${space.id}/map`)).statusCode).toBe(404);

    const noName = await signIn(t, 'sin-nombre@example.com');
    const link = (
      await call(owner, 'POST', `/spaces/${space.id}/invites`, { role: 'member' })
    ).json<CreatedInvite>();
    await call(noName, 'POST', `/invites/${link.token}/accept`);
    expect((await call(noName, 'POST', `/spaces/${space.id}/join`)).statusCode).toBe(409);
  });

  it('entrega el mapa del espacio a sus miembros', async () => {
    const { owner, space } = await ownerWithSpace();
    const res = await call(owner, 'GET', `/spaces/${space.id}/map`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tilewidth: 16 });
  });
});

describe('avisos al servidor de juego', () => {
  it('avisa al expulsar a alguien y al borrar el espacio', async () => {
    const { owner, space } = await ownerWithSpace();
    const bea = await signInWithProfile(t, 'bea@example.com', 'Bea');
    const link = (
      await call(owner, 'POST', `/spaces/${space.id}/invites`, { role: 'member' })
    ).json<CreatedInvite>();
    await call(bea, 'POST', `/invites/${link.token}/accept`);
    const beaId = (await t.db.user.findUniqueOrThrow({ where: { email: 'bea@example.com' } })).id;

    t.events.length = 0;
    await call(owner, 'DELETE', `/spaces/${space.id}/members/${beaId}`);
    await call(owner, 'DELETE', `/spaces/${space.id}`);
    expect(t.events).toEqual([
      { type: 'member-removed', spaceId: space.id, userId: beaId },
      { type: 'space-deleted', spaceId: space.id },
    ]);
  });
});
