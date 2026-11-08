import { afterAll, describe, expect, it } from 'vitest';
import type {
  CreatedInvite,
  Invite,
  InvitePreview,
  Member,
  Role,
  SpaceSummary,
} from '@pixels/shared';
import { WEB_ORIGIN, createTestApp, signInWithProfile, useCleanDatabase } from './test-config.js';

useCleanDatabase();
const t = await createTestApp();
afterAll(() => t.app.close());

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Petición como la haría la web (con la cookie de sesión y el origen). */
const call = (cookie: string | null, method: Method, url: string, payload?: object) =>
  t.app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(payload ? { payload } : {}),
  });

async function createSpace(cookie: string, name = 'Equipo') {
  const res = await call(cookie, 'POST', '/spaces', { name });
  expect(res.statusCode).toBe(201);
  return res.json<SpaceSummary>();
}

async function invite(cookie: string, spaceId: string, role: 'member' | 'guest' = 'member') {
  const res = await call(cookie, 'POST', `/spaces/${spaceId}/invites`, { role, days: 7 });
  expect(res.statusCode).toBe(201);
  return res.json<CreatedInvite>();
}

async function accept(cookie: string, token: string) {
  return call(cookie, 'POST', `/invites/${token}/accept`);
}

/** Un espacio con una persona por rol. */
async function spaceWithEveryRole() {
  const owner = await signInWithProfile(t, 'owner@example.com', 'Olga');
  const admin = await signInWithProfile(t, 'admin@example.com', 'Adán');
  const member = await signInWithProfile(t, 'member@example.com', 'Marta');
  const guest = await signInWithProfile(t, 'guest@example.com', 'Gus');
  const outsider = await signInWithProfile(t, 'outsider@example.com', 'Óscar');
  const space = await createSpace(owner);

  const memberInvite = await invite(owner, space.id, 'member');
  await accept(admin, memberInvite.token);
  await accept(member, memberInvite.token);
  await accept(guest, (await invite(owner, space.id, 'guest')).token);

  const members = (await call(owner, 'GET', `/spaces/${space.id}/members`)).json<Member[]>();
  const id = (email: string) => members.find((m) => m.email === email)!.userId;
  const ids = {
    owner: id('owner@example.com'),
    admin: id('admin@example.com'),
    member: id('member@example.com'),
    guest: id('guest@example.com'),
  };
  await call(owner, 'PATCH', `/spaces/${space.id}/members/${ids.admin}`, { role: 'admin' });
  return { space, cookies: { owner, admin, member, guest, outsider }, ids };
}

describe('espacios', () => {
  it('quien crea un espacio es su dueño y lo ve en su lista', async () => {
    const ana = await signInWithProfile(t, 'ana@example.com', 'Ana');
    const space = await createSpace(ana, '  Oficina de Ana ');
    expect(space).toMatchObject({ name: 'Oficina de Ana', role: 'owner' });

    const list = await call(ana, 'GET', '/spaces');
    expect(list.json<SpaceSummary[]>()).toEqual([space]);

    // El mapa se guarda en la base de datos, como copia propia del espacio.
    const stored = await t.db.space.findUniqueOrThrow({
      where: { id: space.id },
      include: { map: true },
    });
    expect(stored.map.template).toBe('office');
    expect(stored.map.data).toHaveProperty('layers');
  });

  it('exige sesión y un nombre', async () => {
    expect((await call(null, 'GET', '/spaces')).statusCode).toBe(401);
    const ana = await signInWithProfile(t, 'ana@example.com', 'Ana');
    expect((await call(ana, 'POST', '/spaces', { name: '   ' })).statusCode).toBe(400);
  });

  it('a quien no es miembro le responde 404 (no revela que existe)', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    for (const url of [`/spaces/${space.id}`, `/spaces/${space.id}/members`]) {
      expect((await call(cookies.outsider, 'GET', url)).statusCode).toBe(404);
    }
    expect(
      (await call(cookies.outsider, 'PATCH', `/spaces/${space.id}`, { name: 'Mío' })).statusCode,
    ).toBe(404);
    expect((await call(cookies.outsider, 'DELETE', `/spaces/${space.id}`)).statusCode).toBe(404);
  });

  it('dueño y admin renombran; miembro e invitado no', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    const rename = (cookie: string, name: string) =>
      call(cookie, 'PATCH', `/spaces/${space.id}`, { name });
    expect((await rename(cookies.owner, 'A')).statusCode).toBe(200);
    expect((await rename(cookies.admin, 'B')).statusCode).toBe(200);
    expect((await rename(cookies.member, 'C')).statusCode).toBe(403);
    expect((await rename(cookies.guest, 'D')).statusCode).toBe(403);
    expect((await call(cookies.member, 'GET', `/spaces/${space.id}`)).json()).toMatchObject({
      name: 'B',
      role: 'member',
    });
  });

  it('solo el dueño borra el espacio (y su mapa)', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    expect((await call(cookies.admin, 'DELETE', `/spaces/${space.id}`)).statusCode).toBe(403);
    expect((await call(cookies.owner, 'DELETE', `/spaces/${space.id}`)).statusCode).toBe(204);
    expect(await t.db.space.count()).toBe(0);
    expect(await t.db.map.count()).toBe(0);
    expect(await t.db.membership.count()).toBe(0);
  });
});

describe('miembros y roles', () => {
  it('los invitados no ven la lista de miembros; el correo solo lo ven dueño y admins', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    const url = `/spaces/${space.id}/members`;
    expect((await call(cookies.guest, 'GET', url)).statusCode).toBe(403);

    const asMember = (await call(cookies.member, 'GET', url)).json<Member[]>();
    expect(asMember.map((m) => [m.name, m.role])).toEqual([
      ['Olga', 'owner'],
      ['Adán', 'admin'],
      ['Marta', 'member'],
      ['Gus', 'guest'],
    ]);
    expect(asMember.every((m) => m.email === null)).toBe(true);

    const asAdmin = (await call(cookies.admin, 'GET', url)).json<Member[]>();
    expect(asAdmin[0]!.email).toBe('owner@example.com');
  });

  it('aplica quién puede cambiar qué rol', async () => {
    const { space, cookies, ids } = await spaceWithEveryRole();
    const setRole = (cookie: string, userId: string, role: Role) =>
      call(cookie, 'PATCH', `/spaces/${space.id}/members/${userId}`, { role });

    expect((await setRole(cookies.admin, ids.guest, 'member')).statusCode).toBe(200);
    expect((await setRole(cookies.admin, ids.member, 'admin')).statusCode).toBe(403);
    expect((await setRole(cookies.admin, ids.owner, 'guest')).statusCode).toBe(403);
    expect((await setRole(cookies.member, ids.guest, 'guest')).statusCode).toBe(403);
    expect((await setRole(cookies.owner, ids.member, 'owner')).statusCode).toBe(403);
    expect((await setRole(cookies.owner, ids.owner, 'admin')).statusCode).toBe(403);
    expect((await setRole(cookies.owner, ids.member, 'admin')).statusCode).toBe(200);
    expect((await setRole(cookies.owner, ids.member, 'superadmin' as Role)).statusCode).toBe(400);
  });

  it('expulsar y salir', async () => {
    const { space, cookies, ids } = await spaceWithEveryRole();
    const remove = (cookie: string, userId: string) =>
      call(cookie, 'DELETE', `/spaces/${space.id}/members/${userId}`);

    expect((await remove(cookies.member, ids.guest)).statusCode).toBe(403);
    expect((await remove(cookies.admin, ids.owner)).statusCode).toBe(403);
    expect((await remove(cookies.owner, ids.owner)).statusCode).toBe(403);
    expect((await remove(cookies.admin, ids.guest)).statusCode).toBe(204);
    expect((await remove(cookies.member, ids.member)).statusCode).toBe(204);

    // Quien sale o es expulsado ya no ve el espacio.
    expect((await call(cookies.guest, 'GET', `/spaces/${space.id}`)).statusCode).toBe(404);
    expect((await call(cookies.member, 'GET', '/spaces')).json()).toEqual([]);
  });
});

describe('invitaciones', () => {
  it('un enlace da acceso con su rol y cuenta los usos', async () => {
    const owner = await signInWithProfile(t, 'owner@example.com', 'Olga');
    const bea = await signInWithProfile(t, 'bea@example.com', 'Bea');
    const space = await createSpace(owner, 'Equipo');
    const created = await invite(owner, space.id, 'guest');
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    // Sin login se puede ver a qué espacio invita.
    const preview = await call(null, 'GET', `/invites/${created.token}`);
    expect(preview.json<InvitePreview>()).toEqual({ spaceName: 'Equipo', role: 'guest' });

    // Aceptar exige sesión.
    expect((await accept('', created.token)).statusCode).toBe(401);
    const res = await accept(bea, created.token);
    expect(res.json()).toEqual({ spaceId: space.id });
    expect((await call(bea, 'GET', `/spaces/${space.id}`)).json()).toMatchObject({ role: 'guest' });

    const list = (await call(owner, 'GET', `/spaces/${space.id}/invites`)).json<Invite[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, uses: 1, createdBy: 'Olga' });
    expect(list[0]).not.toHaveProperty('token');

    // En la base de datos no está el token, solo su hash.
    const row = await t.db.invite.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tokenHash).not.toContain(created.token);
  });

  it('aceptar otra vez no cambia el rol de quien ya es miembro', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    const guestLink = await invite(cookies.owner, space.id, 'guest');
    expect((await accept(cookies.admin, guestLink.token)).statusCode).toBe(200);
    expect((await call(cookies.admin, 'GET', `/spaces/${space.id}`)).json()).toMatchObject({
      role: 'admin',
    });
  });

  it('solo dueño y admin crean, ven y revocan enlaces', async () => {
    const { space, cookies } = await spaceWithEveryRole();
    const url = `/spaces/${space.id}/invites`;
    expect((await call(cookies.member, 'POST', url, { role: 'member' })).statusCode).toBe(403);
    expect((await call(cookies.guest, 'GET', url)).statusCode).toBe(403);
    expect((await call(cookies.admin, 'POST', url, { role: 'admin' })).statusCode).toBe(400);
    expect((await call(cookies.admin, 'POST', url, { role: 'member', days: 90 })).statusCode).toBe(
      400,
    );

    const link = await invite(cookies.admin, space.id, 'member');
    expect((await call(cookies.member, 'DELETE', `${url}/${link.id}`)).statusCode).toBe(403);
    expect((await call(cookies.admin, 'DELETE', `${url}/${link.id}`)).statusCode).toBe(204);
    expect((await call(null, 'GET', `/invites/${link.token}`)).statusCode).toBe(404);
    expect((await accept(cookies.outsider, link.token)).statusCode).toBe(404);
  });

  it('los enlaces caducan', async () => {
    const owner = await signInWithProfile(t, 'owner@example.com', 'Olga');
    const bea = await signInWithProfile(t, 'bea@example.com', 'Bea');
    const space = await createSpace(owner);
    const link = await invite(owner, space.id);
    await t.db.invite.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await call(null, 'GET', `/invites/${link.token}`)).statusCode).toBe(404);
    expect((await accept(bea, link.token)).statusCode).toBe(404);
    expect((await call(owner, 'GET', `/spaces/${space.id}/invites`)).json()).toEqual([]);
  });

  it('un token inventado no sirve', async () => {
    const bea = await signInWithProfile(t, 'bea@example.com', 'Bea');
    expect((await accept(bea, 'a'.repeat(32))).statusCode).toBe(404);
    expect((await call(null, 'GET', '/invites/../../etc')).statusCode).toBe(404);
  });
});
