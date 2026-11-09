/**
 * Roles dentro de un espacio y qué puede hacer cada uno. La API aplica estas reglas; la web las usa
 * solo para mostrar u ocultar botones.
 */
export const ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Dueño',
  admin: 'Admin',
  member: 'Miembro',
  guest: 'Invitado',
};

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

const isManager = (role: Role) => role === 'owner' || role === 'admin';

export const can = {
  renameSpace: isManager,
  deleteSpace: (role: Role) => role === 'owner',
  /** Los invitados no ven la lista de miembros. */
  viewMembers: (role: Role) => role !== 'guest',
  manageInvites: isManager,
  editMap: isManager,
};

/** Roles que se pueden dar con un enlace de invitación. */
export const INVITE_ROLES = ['member', 'guest'] as const satisfies readonly Role[];
export type InviteRole = (typeof INVITE_ROLES)[number];

export const isInviteRole = (value: unknown): value is InviteRole =>
  typeof value === 'string' && (INVITE_ROLES as readonly string[]).includes(value);

/**
 * ¿Puede `actor` cambiar el rol de otra persona (`target`) a `next`? Nadie cambia su propio rol ni
 * el del dueño, y nadie pasa a ser dueño. El dueño nombra admins; un admin solo mueve a miembros e
 * invitados entre esos dos roles.
 */
export function canChangeRole(actor: Role, target: Role, next: Role): boolean {
  if (target === 'owner' || next === 'owner') return false;
  if (actor === 'owner') return true;
  if (actor === 'admin') return target !== 'admin' && next !== 'admin';
  return false;
}

/** ¿Puede `actor` sacar a `target` del espacio? Salir uno mismo siempre se puede, salvo el dueño. */
export function canRemoveMember(actor: Role, target: Role, self: boolean): boolean {
  if (target === 'owner') return false;
  if (self) return true;
  if (actor === 'owner') return true;
  return actor === 'admin' && target !== 'admin';
}
