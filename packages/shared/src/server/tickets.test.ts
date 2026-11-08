import { describe, expect, it } from 'vitest';
import {
  signJoinTicket,
  signMediaTicket,
  verifyJoinTicket,
  verifyMediaTicket,
  type JoinTicketPayload,
} from './tickets.js';

const SECRET = 'secreto-de-prueba';
const media = { sid: 'abc123', room: 'world-r1', name: 'Alice', exp: 2_000 };
const join: JoinTicketPayload = {
  uid: 'user-1',
  space: 'space-1',
  name: 'Alice',
  avatar: 2,
  role: 'member',
  exp: 2_000,
};

describe('tickets firmados', () => {
  it('verifica tickets válidos', () => {
    expect(verifyMediaTicket(signMediaTicket(media, SECRET), SECRET, 1_000)).toEqual(media);
    expect(verifyJoinTicket(signJoinTicket(join, SECRET), SECRET, 1_000)).toEqual(join);
  });

  it('rechaza tickets caducados', () => {
    expect(verifyMediaTicket(signMediaTicket(media, SECRET), SECRET, 2_000)).toBeNull();
    expect(verifyJoinTicket(signJoinTicket(join, SECRET), SECRET, 2_000)).toBeNull();
  });

  it('rechaza un ticket firmado con otro secreto', () => {
    expect(verifyMediaTicket(signMediaTicket(media, 'otro'), SECRET, 1_000)).toBeNull();
    expect(verifyJoinTicket(signJoinTicket(join, 'otro'), SECRET, 1_000)).toBeNull();
  });

  it('un ticket de un tipo no vale como otro', () => {
    const asMedia = signMediaTicket({ ...media, ...join } as never, SECRET);
    expect(verifyJoinTicket(asMedia, SECRET, 1_000)).toBeNull();
    const asJoin = signJoinTicket({ ...join, ...media } as never, SECRET);
    expect(verifyMediaTicket(asJoin, SECRET, 1_000)).toBeNull();
  });

  it('rechaza un ticket modificado (otra identidad con la firma original)', () => {
    const [k, v, , sig] = signJoinTicket(join, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...join, role: 'owner' })).toString('base64url');
    expect(verifyJoinTicket(`${k}.${v}.${forged}.${sig}`, SECRET, 1_000)).toBeNull();
  });

  it('rechaza contenido incompleto aunque esté bien firmado', () => {
    const noRole = signJoinTicket({ ...join, role: 'superadmin' } as never, SECRET);
    expect(verifyJoinTicket(noRole, SECRET, 1_000)).toBeNull();
    const noUid = signJoinTicket({ ...join, uid: '' }, SECRET);
    expect(verifyJoinTicket(noUid, SECRET, 1_000)).toBeNull();
  });

  it('rechaza basura', () => {
    for (const bad of [undefined, 42, '', 'v1', 'media.v1.a.b', 'media.v2.a.b', 'x'.repeat(5000)])
      expect(verifyMediaTicket(bad, SECRET, 1_000)).toBeNull();
  });
});
