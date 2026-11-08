import { describe, expect, it } from 'vitest';
import { parseProfile, parseSpaceName } from './api.js';
import { can, canChangeRole, canRemoveMember } from './roles.js';

describe('permisos por rol', () => {
  it('solo dueño y admin renombran e invitan; solo el dueño borra', () => {
    expect([can.renameSpace('owner'), can.renameSpace('admin'), can.renameSpace('member')]).toEqual(
      [true, true, false],
    );
    expect(can.manageInvites('guest')).toBe(false);
    expect([can.deleteSpace('owner'), can.deleteSpace('admin')]).toEqual([true, false]);
  });

  it('los invitados no ven la lista de miembros', () => {
    expect(can.viewMembers('member')).toBe(true);
    expect(can.viewMembers('guest')).toBe(false);
  });

  it('el dueño nombra admins; un admin solo mueve entre miembro e invitado', () => {
    expect(canChangeRole('owner', 'member', 'admin')).toBe(true);
    expect(canChangeRole('owner', 'admin', 'guest')).toBe(true);
    expect(canChangeRole('admin', 'member', 'guest')).toBe(true);
    expect(canChangeRole('admin', 'member', 'admin')).toBe(false);
    expect(canChangeRole('admin', 'admin', 'member')).toBe(false);
    expect(canChangeRole('member', 'guest', 'member')).toBe(false);
  });

  it('nadie toca al dueño ni pasa a ser dueño', () => {
    expect(canChangeRole('owner', 'member', 'owner')).toBe(false);
    expect(canChangeRole('admin', 'owner', 'member')).toBe(false);
    expect(canRemoveMember('admin', 'owner', false)).toBe(false);
    expect(canRemoveMember('owner', 'owner', true)).toBe(false);
  });

  it('cualquiera puede salir; expulsar depende del rol', () => {
    expect(canRemoveMember('guest', 'guest', true)).toBe(true);
    expect(canRemoveMember('member', 'guest', false)).toBe(false);
    expect(canRemoveMember('admin', 'member', false)).toBe(true);
    expect(canRemoveMember('admin', 'admin', false)).toBe(false);
    expect(canRemoveMember('owner', 'admin', false)).toBe(true);
  });
});

describe('validación de la API', () => {
  it('limpia el perfil y rechaza nombres vacíos o avatares que no existen', () => {
    expect(parseProfile({ name: '  Ana   López ', avatar: 2 })).toEqual({
      name: 'Ana López',
      avatar: 2,
    });
    expect(parseProfile({ name: '   ', avatar: 0 })).toBeNull();
    expect(parseProfile({ name: 'Ana', avatar: 99 })).toBeNull();
    expect(parseProfile({ name: 'Ana', avatar: 1.5 })).toBeNull();
    expect(parseProfile(null)).toBeNull();
  });

  it('limita el nombre del espacio', () => {
    expect(parseSpaceName('  Equipo  ')).toBe('Equipo');
    expect(parseSpaceName('')).toBeNull();
    expect(parseSpaceName(42)).toBeNull();
    expect(parseSpaceName('x'.repeat(100))).toHaveLength(40);
  });
});
