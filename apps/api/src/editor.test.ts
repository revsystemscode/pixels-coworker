import { afterAll, describe, expect, it } from 'vitest';
import {
  MAPS,
  parseTiledForEditing,
  toTiled,
  type CreatedInvite,
  type MapEditorResponse,
  type PublishMapResponse,
  type SpaceSummary,
  type TiledMap,
} from '@pixels/shared';
import { WEB_ORIGIN, createTestApp, signInWithProfile, useCleanDatabase } from './test-config.js';

useCleanDatabase();
const t = await createTestApp();
afterAll(() => t.app.close());

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';
const call = (cookie: string, method: Method, url: string, payload?: object) =>
  t.app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN, cookie },
    ...(payload ? { payload } : {}),
  });

/** Dueña, admin y miembro de un espacio nuevo. */
async function setup() {
  const owner = await signInWithProfile(t, 'olga@example.com', 'Olga');
  const admin = await signInWithProfile(t, 'adan@example.com', 'Adán');
  const member = await signInWithProfile(t, 'marta@example.com', 'Marta');
  const space = (await call(owner, 'POST', '/spaces', { name: 'Equipo' })).json<SpaceSummary>();
  const invite = (
    await call(owner, 'POST', `/spaces/${space.id}/invites`, { role: 'member', days: 7 })
  ).json<CreatedInvite>();
  for (const cookie of [admin, member])
    await call(cookie, 'POST', `/invites/${invite.token}/accept`);
  const members = (await call(owner, 'GET', `/spaces/${space.id}/members`)).json<
    { userId: string; email: string }[]
  >();
  const adminId = members.find((m) => m.email === 'adan@example.com')!.userId;
  await call(owner, 'PATCH', `/spaces/${space.id}/members/${adminId}`, { role: 'admin' });
  return { space, owner, admin, member, url: `/spaces/${space.id}/editor` };
}

/** La oficina con una pared más (en la fila 20, x 30–33) y sin la pizarra de reuniones. */
function editedOffice(): TiledMap {
  const parsed = parseTiledForEditing(structuredClone(MAPS.office));
  if (!parsed.ok) throw new Error(parsed.error);
  const m = parsed.map;
  for (let x = 30; x <= 33; x++) {
    m.layers.furniture[20 * m.width + x] = 0;
    m.collision[20 * m.width + x] = 1;
  }
  m.whiteboards = m.whiteboards.filter((b) => b.name !== 'Pizarra de reuniones');
  return toTiled(m);
}

describe('editor de mapas', () => {
  it('el navegador puede guardar el borrador desde la web (CORS permite PUT)', async () => {
    const res = await t.app.inject({
      method: 'OPTIONS',
      url: '/spaces/x/editor/draft',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.headers['access-control-allow-methods']).toContain('PUT');
  });

  it('solo el dueño y los admins lo usan', async () => {
    const { owner, admin, member, url } = await setup();
    expect((await call(owner, 'GET', url)).statusCode).toBe(200);
    expect((await call(admin, 'GET', url)).statusCode).toBe(200);
    expect((await call(member, 'GET', url)).statusCode).toBe(403);
    expect((await call(member, 'PUT', `${url}/draft`, { map: MAPS.office })).statusCode).toBe(403);
    expect((await call(member, 'POST', `${url}/publish`)).statusCode).toBe(403);
    const outsider = await signInWithProfile(t, 'oscar@example.com', 'Óscar');
    expect((await call(outsider, 'GET', url)).statusCode).toBe(404);
  });

  it('guarda un borrador validado sin tocar el mapa publicado', async () => {
    const { owner, member, space, url } = await setup();
    const before = (await call(member, 'POST', `/spaces/${space.id}/join`)).json<{
      mapVersion: string;
    }>().mapVersion;

    const bad = await call(owner, 'PUT', `${url}/draft`, { map: { ...MAPS.office, width: 500 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<{ error: string }>().error).toMatch(/entre 8 y 100/);

    expect((await call(owner, 'PUT', `${url}/draft`, { map: editedOffice() })).statusCode).toBe(
      200,
    );
    const editor = (await call(owner, 'GET', url)).json<MapEditorResponse>();
    expect(editor.draft).toEqual(editedOffice());
    expect(editor.published).toEqual(MAPS.office);
    // Quien entra sigue usando el mapa publicado (misma versión).
    const after = (await call(member, 'POST', `/spaces/${space.id}/join`)).json<{
      mapVersion: string;
    }>().mapVersion;
    expect(after).toBe(before);

    expect((await call(owner, 'DELETE', `${url}/draft`)).statusCode).toBe(204);
    expect((await call(owner, 'GET', url)).json<MapEditorResponse>().draft).toBeNull();
  });

  it('al publicar, el borrador pasa a ser el mapa, se avisa al juego y se borra lo huérfano', async () => {
    const { admin, member, space, url } = await setup();
    expect((await call(admin, 'POST', `${url}/publish`)).statusCode).toBe(409);

    // Contenido de la pizarra que se va a quitar y de la que se queda.
    await t.db.whiteboard.createMany({
      data: [
        { spaceId: space.id, boardId: 'board-4', elements: [] },
        { spaceId: space.id, boardId: 'board-5', elements: [] },
      ],
    });
    await call(admin, 'PUT', `${url}/draft`, { map: editedOffice() });
    const published = await call(admin, 'POST', `${url}/publish`);
    expect(published.statusCode).toBe(200);

    const map = (await call(member, 'GET', `/spaces/${space.id}/map`)).json<TiledMap>();
    expect(map).toEqual(editedOffice());
    expect((await call(member, 'POST', `/spaces/${space.id}/join`)).json()).toMatchObject({
      mapVersion: published.json<PublishMapResponse>().mapVersion,
    });
    expect(t.events.at(-1)).toEqual({ type: 'map-updated', spaceId: space.id });
    const boards = await t.db.whiteboard.findMany({ where: { spaceId: space.id } });
    expect(boards.map((b) => b.boardId)).toEqual(['board-5']);
    expect((await call(admin, 'GET', url)).json<MapEditorResponse>().draft).toBeNull();
  });
});
