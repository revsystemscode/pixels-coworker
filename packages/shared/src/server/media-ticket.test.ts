import { describe, expect, it } from 'vitest';
import { signMediaTicket, verifyMediaTicket } from './media-ticket.js';

const SECRET = 'secreto-de-prueba';
const payload = { sid: 'abc123', room: 'world-r1', name: 'Alice', exp: 2_000 };

describe('ticket de medios', () => {
  it('verifica un ticket válido', () => {
    expect(verifyMediaTicket(signMediaTicket(payload, SECRET), SECRET, 1_000)).toEqual(payload);
  });

  it('rechaza un ticket caducado', () => {
    expect(verifyMediaTicket(signMediaTicket(payload, SECRET), SECRET, 2_000)).toBeNull();
  });

  it('rechaza un ticket firmado con otro secreto', () => {
    expect(verifyMediaTicket(signMediaTicket(payload, 'otro'), SECRET, 1_000)).toBeNull();
  });

  it('rechaza un ticket modificado (otra identidad con la firma original)', () => {
    const [v, , sig] = signMediaTicket(payload, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, sid: 'victima' })).toString(
      'base64url',
    );
    expect(verifyMediaTicket(`${v}.${forged}.${sig}`, SECRET, 1_000)).toBeNull();
  });

  it('rechaza basura', () => {
    for (const bad of [undefined, 42, '', 'v1', 'v1.a.b', 'v2.a.b', 'x'.repeat(5000)])
      expect(verifyMediaTicket(bad, SECRET, 1_000)).toBeNull();
  });
});
