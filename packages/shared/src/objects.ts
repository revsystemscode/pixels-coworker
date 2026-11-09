import { NOTE_MAX_LENGTH, URL_MAX_LENGTH } from './constants.js';
import { can, type Role } from './roles.js';

/**
 * Objetos interactivos del mapa (capa "objects" de Tiled). Su contenido es un texto:
 * - link: dirección web (http o https).
 * - video: "youtube:<id>" o "vimeo:<id>" (nunca una URL cualquiera dentro de un iframe).
 * - note: texto libre.
 * - game: mesa del minijuego (no tiene contenido editable).
 */
export const OBJECT_KINDS = ['link', 'video', 'note', 'game'] as const;
export type MapObjectKind = (typeof OBJECT_KINDS)[number];

export const isObjectKind = (raw: unknown): raw is MapObjectKind =>
  typeof raw === 'string' && (OBJECT_KINDS as readonly string[]).includes(raw);

/** Tipos con contenido que pueden cambiar el dueño y los admins. */
export const EDITABLE_KINDS: readonly MapObjectKind[] = ['link', 'video', 'note'];

/** Quién puede cambiar notas, enlaces y videos. */
export const canEditObjects = (role: Role) => can.renameSpace(role);

export type ParsedValue = { ok: true; value: string } | { ok: false; error: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'];

const withScheme = (raw: string) => (/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(withScheme(raw));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** "youtube:<id>" o "vimeo:<id>" a partir de un enlace de YouTube o Vimeo, o null. */
export function parseVideoUrl(raw: string): string | null {
  const url = parseUrl(raw.trim());
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (host === 'youtu.be') id = parts[0];
  else if (YOUTUBE_HOSTS.includes(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined;
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1];
  } else if (host === 'vimeo.com' && parts.length === 1) {
    return VIMEO_ID.test(parts[0]!) ? `vimeo:${parts[0]}` : null;
  } else if (host === 'player.vimeo.com' && parts[0] === 'video') {
    return VIMEO_ID.test(parts[1] ?? '') ? `vimeo:${parts[1]}` : null;
  }
  return id && YOUTUBE_ID.test(id) ? `youtube:${id}` : null;
}

/** Dirección del reproductor para un video guardado ("youtube:<id>" o "vimeo:<id>"). */
export function videoEmbedUrl(value: string): string | null {
  const [provider, id = ''] = value.split(':');
  if (provider === 'youtube' && YOUTUBE_ID.test(id)) {
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  if (provider === 'vimeo' && VIMEO_ID.test(id)) return `https://player.vimeo.com/video/${id}`;
  return null;
}

/** Dirección para abrir el video en su web (fuera del iframe). */
export function videoPageUrl(value: string): string | null {
  const [provider, id = ''] = value.split(':');
  if (provider === 'youtube' && YOUTUBE_ID.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  if (provider === 'vimeo' && VIMEO_ID.test(id)) return `https://vimeo.com/${id}`;
  return null;
}

/**
 * Valida y normaliza lo que escribe quien edita el objeto. Vacío = sin contenido. Nunca confiar en
 * el cliente: el servidor de juego lo vuelve a pasar por aquí.
 */
export function parseObjectValue(kind: MapObjectKind, raw: unknown): ParsedValue {
  if (typeof raw !== 'string') return { ok: false, error: 'Contenido no válido.' };
  if (kind === 'note') {
    // Quita caracteres de control (salvo saltos de línea y tabuladores).
    // eslint-disable-next-line no-control-regex
    const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
    if (text.length > NOTE_MAX_LENGTH) {
      return { ok: false, error: `La nota puede tener ${NOTE_MAX_LENGTH} caracteres como mucho.` };
    }
    return { ok: true, value: text.trim() };
  }
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: '' };
  if (trimmed.length > URL_MAX_LENGTH)
    return { ok: false, error: 'La dirección es demasiado larga.' };
  if (kind === 'link') {
    const url = parseUrl(trimmed);
    if (!url || !url.hostname.includes('.')) {
      return { ok: false, error: 'Escribe una dirección web, por ejemplo https://ejemplo.com.' };
    }
    if (url.username || url.password) {
      return { ok: false, error: 'La dirección no puede llevar usuario ni contraseña.' };
    }
    return { ok: true, value: url.href };
  }
  if (kind === 'video') {
    const video = parseVideoUrl(trimmed);
    return video
      ? { ok: true, value: video }
      : { ok: false, error: 'Pega un enlace de YouTube o de Vimeo.' };
  }
  return { ok: false, error: 'Este objeto no se puede editar.' };
}

// --- Mensajes ---

/** Cliente → servidor: nuevo contenido de un objeto (solo dueño y admins). */
export interface ObjectEditMessage {
  objectId: string;
  value: string;
}

/** Servidor → cliente al entrar: contenido de todos los objetos (los que tienen). */
export interface ObjectContentsMessage {
  contents: Record<string, string>;
}

/** Servidor → todos: alguien cambió un objeto. */
export interface ObjectContentMessage {
  objectId: string;
  value: string;
}

/** Servidor → quien editó: no se pudo guardar. */
export interface ObjectErrorMessage {
  objectId: string;
  message: string;
}

/** Servidor → cliente: su rol en el espacio cambió (lo cambió un admin desde otra sesión). */
export interface RoleChangedMessage {
  role: Role;
}

const OBJECT_ID = /^obj-\d{1,9}$/;

export function parseObjectEdit(raw: unknown): ObjectEditMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { objectId, value } = raw as Record<string, unknown>;
  if (typeof objectId !== 'string' || !OBJECT_ID.test(objectId)) return null;
  if (typeof value !== 'string' || value.length > NOTE_MAX_LENGTH * 2) return null;
  return { objectId, value };
}
