import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Ticket de medios: el servidor de juego lo entrega a cada jugador al entrar y la API lo canjea por
 * un token de LiveKit. Así la identidad en LiveKit es siempre el sessionId real del jugador y nadie
 * puede pedir un token en nombre de otro. Firmado con HMAC-SHA256 y un secreto compartido entre el
 * servidor de juego y la API (MEDIA_TICKET_SECRET). Solo para código de servidor.
 */
export interface MediaTicketPayload {
  /** sessionId de Colyseus: será la identidad en LiveKit. */
  sid: string;
  /** Sala de LiveKit (una por sala de Colyseus). */
  room: string;
  name: string;
  /** Caducidad en milisegundos desde epoch. */
  exp: number;
}

const VERSION = 'v1';

const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

export function signMediaTicket(payload: MediaTicketPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${VERSION}.${body}`;
  return `${data}.${sign(data, secret)}`;
}

/** Devuelve el contenido si la firma es válida y no ha caducado; si no, null. */
export function verifyMediaTicket(
  ticket: unknown,
  secret: string,
  now = Date.now(),
): MediaTicketPayload | null {
  if (typeof ticket !== 'string' || ticket.length > 2048) return null;
  const [version, body, signature] = ticket.split('.');
  if (version !== VERSION || !body || !signature) return null;

  const expected = Buffer.from(sign(`${version}.${body}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const { sid, room, name, exp } = (payload ?? {}) as Record<string, unknown>;
  if (
    typeof sid !== 'string' ||
    !sid ||
    typeof room !== 'string' ||
    !room ||
    typeof name !== 'string' ||
    typeof exp !== 'number' ||
    exp <= now
  ) {
    return null;
  }
  return { sid, room, name, exp };
}
