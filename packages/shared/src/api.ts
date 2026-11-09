/** Tipos de la API HTTP (cuentas, espacios e invitaciones). */
import { isAvatar } from './avatar.js';
import { NAME_MAX_LENGTH } from './constants.js';
import type { InviteRole, Role } from './roles.js';

/** GET /auth/options: qué formas de login están activas. */
export interface AuthOptionsResponse {
  google: boolean;
}

/** GET /me */
export interface Me {
  id: string;
  email: string;
  /** Vacío hasta que la persona elige su nombre. */
  name: string;
  avatar: number;
}

/** PATCH /me */
export interface ProfileUpdate {
  name: string;
  avatar: number;
}

export const SPACE_NAME_MAX_LENGTH = 40;

/** GET /spaces (los espacios de los que soy miembro) */
export interface SpaceSummary {
  id: string;
  name: string;
  role: Role;
}

export interface Member {
  userId: string;
  name: string;
  /** Solo lo ven el dueño y los admins. */
  email: string | null;
  avatar: number;
  role: Role;
}

/** Máximo de espacios que puede crear (y tener como dueño) una persona. */
export const MAX_OWNED_SPACES = 20;

/** POST /spaces/:id/invites */
export interface CreateInviteRequest {
  role: InviteRole;
  /** Días hasta que caduca (1–30). */
  days: number;
}

export interface Invite {
  id: string;
  role: InviteRole;
  expiresAt: string;
  uses: number;
  createdBy: string | null;
}

/** El enlace completo solo se devuelve al crearlo (en la base de datos se guarda su hash). */
export interface CreatedInvite extends Invite {
  token: string;
}

export const INVITE_MAX_DAYS = 30;
export const INVITE_DEFAULT_DAYS = 7;

/** GET /invites/:token (sin login): para mostrar a qué espacio te invitan. */
export interface InvitePreview {
  spaceName: string;
  role: InviteRole;
}

/** POST /invites/:token/accept */
export interface AcceptInviteResponse {
  spaceId: string;
}

/** POST /spaces/:id/join: ticket para entrar a la sala de juego del espacio. */
export interface JoinSpaceResponse {
  ticket: string;
  space: SpaceSummary;
  /** Versión del mapa (para la caché de GET /spaces/:id/map). */
  mapVersion: string;
}

/** Cuerpo de error de la API. */
export interface ApiError {
  error: string;
}

// --- Validación ---

const cleanText = (raw: unknown, max: number) =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Devuelve el perfil limpio, o null si el nombre está vacío o el avatar no existe. */
export function parseProfile(raw: unknown): ProfileUpdate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { name, avatar } = raw as Record<string, unknown>;
  const clean = cleanText(name, NAME_MAX_LENGTH);
  if (!clean) return null;
  if (!isAvatar(avatar)) return null;
  return { name: clean, avatar };
}

/** Nombre de espacio limpio, o null si queda vacío. */
export function parseSpaceName(raw: unknown): string | null {
  return cleanText(raw, SPACE_NAME_MAX_LENGTH) || null;
}
