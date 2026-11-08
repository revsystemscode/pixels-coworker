import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  INVITE_ROLES,
  ROLES,
  ROLE_LABELS,
  SPACE_NAME_MAX_LENGTH,
  can,
  canChangeRole,
  canRemoveMember,
  type CreatedInvite,
  type Invite,
  type InviteRole,
  type Member,
  type Role,
  type SpaceSummary,
} from '@pixels/shared';
import { api, errorMessage } from '../api.js';
import { useSession } from '../auth.js';
import { useApp } from '../store.js';
import { AvatarPreview } from './AvatarPreview.js';

const DAY_OPTIONS = [1, 7, 30];
const inviteUrl = (token: string) => new URL(`/i/${token}`, window.location.origin).toString();
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

/** Ajustes del espacio: nombre, invitaciones, miembros y roles. Lo que se ve depende del rol. */
export function SpacePanel({ space, onClose }: { space: SpaceSummary; onClose: () => void }) {
  const me = useSession((s) => s.me)!;
  const updateSpace = useApp((s) => s.updateSpace);
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>(space.role);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const path = `/spaces/${space.id}`;
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // El rol puede haber cambiado mientras estaba en el mapa: se pide de nuevo cada vez.
  const fetchState = useCallback(async () => {
    const fresh = await api<SpaceSummary>('GET', path);
    const [members, invites] = await Promise.all([
      can.viewMembers(fresh.role) ? api<Member[]>('GET', `${path}/members`) : null,
      can.manageInvites(fresh.role) ? api<Invite[]>('GET', `${path}/invites`) : null,
    ]);
    return { fresh, members, invites };
  }, [path]);

  const apply = useCallback(
    ({ fresh, members, invites }: Awaited<ReturnType<typeof fetchState>>) => {
      setRole(fresh.role);
      updateSpace(fresh);
      setMembers(members);
      setInvites(invites);
    },
    [updateSpace],
  );

  const reload = useCallback(() => fetchState().then(apply), [fetchState, apply]);

  useEffect(() => {
    let active = true;
    fetchState()
      .then((state) => active && apply(state))
      .catch((err: unknown) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [fetchState, apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="panel space-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="space-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-panel-header">
          <h2 id="space-panel-title">{space.name}</h2>
          <span className="role-badge">{ROLE_LABELS[role]}</span>
          <button type="button" className="secondary" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {can.renameSpace(role) && (
          <RenameForm
            name={space.name}
            onSave={(name) =>
              run(async () => updateSpace(await api<SpaceSummary>('PATCH', path, { name })))
            }
          />
        )}

        {invites && (
          <InviteSection
            invites={invites}
            onCreate={(inviteRole, days) =>
              api<CreatedInvite>('POST', `${path}/invites`, { role: inviteRole, days }).then(
                async (created) => {
                  await reload();
                  return created;
                },
                (err: unknown) => {
                  setError(errorMessage(err));
                  return null;
                },
              )
            }
            onRevoke={(id) =>
              run(async () => {
                await api('DELETE', `${path}/invites/${id}`);
                await reload();
              })
            }
          />
        )}

        {members && (
          <section className="stack">
            <h3>Miembros ({members.length})</h3>
            <ul className="member-list">
              {members.map((m) => {
                const self = m.userId === me.id;
                const options = ROLES.filter(
                  (r) => r === m.role || (!self && canChangeRole(role, m.role, r)),
                );
                return (
                  <li key={m.userId} className="member" data-member={m.name}>
                    <AvatarPreview avatar={m.avatar} scale={2} />
                    <span className="member-name">
                      {m.name || 'Sin nombre'}
                      {self && ' (tú)'}
                      {m.email && <small>{m.email}</small>}
                    </span>
                    {options.length > 1 ? (
                      <select
                        aria-label={`Rol de ${m.name}`}
                        value={m.role}
                        onChange={(e) =>
                          run(async () => {
                            await api('PATCH', `${path}/members/${m.userId}`, {
                              role: e.target.value,
                            });
                            await reload();
                          })
                        }
                      >
                        {options.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="role-badge">{ROLE_LABELS[m.role]}</span>
                    )}
                    {!self && canRemoveMember(role, m.role, false) && (
                      <button
                        type="button"
                        className="secondary danger"
                        onClick={() =>
                          run(async () => {
                            await api('DELETE', `${path}/members/${m.userId}`);
                            await reload();
                          })
                        }
                      >
                        Expulsar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="space-panel-footer">
          {can.deleteSpace(role) ? (
            <ConfirmButton
              label="Borrar espacio"
              confirmLabel="Sí, borrar para todos"
              onConfirm={() =>
                run(async () => {
                  await api('DELETE', path);
                  navigate('/', { replace: true });
                })
              }
            />
          ) : (
            <ConfirmButton
              label="Salir del espacio"
              confirmLabel="Sí, salir (necesitarás otra invitación)"
              onConfirm={() =>
                run(async () => {
                  await api('DELETE', `${path}/members/${me.id}`);
                  navigate('/', { replace: true });
                })
              }
            />
          )}
        </footer>
      </section>
    </div>
  );
}

function RenameForm({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() && value.trim() !== name) void onSave(value.trim());
  };
  return (
    <form className="row" onSubmit={onSubmit}>
      <input
        aria-label="Nombre del espacio"
        value={value}
        maxLength={SPACE_NAME_MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="secondary" disabled={!value.trim() || value.trim() === name}>
        Renombrar
      </button>
    </form>
  );
}

function InviteSection({
  invites,
  onCreate,
  onRevoke,
}: {
  invites: Invite[];
  onCreate: (role: InviteRole, days: number) => Promise<CreatedInvite | null>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [role, setRole] = useState<InviteRole>('member');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setCopied(false);
    setCreated(await onCreate(role, days));
    setBusy(false);
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: el enlace queda seleccionable en el campo.
      setCopied(false);
    }
  };

  return (
    <section className="stack">
      <h3>Invitar</h3>
      <div className="row">
        <select
          aria-label="Rol de la invitación"
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
        >
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          aria-label="Duración de la invitación"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d === 1 ? '1 día' : `${d} días`}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => void create()}>
          Crear enlace
        </button>
      </div>

      {created && (
        <div className="row invite-created">
          <input
            readOnly
            aria-label="Enlace de invitación"
            value={inviteUrl(created.token)}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => void copy(inviteUrl(created.token))}
          >
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      )}
      {created && (
        <p className="subtitle">
          El enlace solo se muestra ahora. Quien lo abra e inicie sesión entrará como{' '}
          {ROLE_LABELS[created.role].toLowerCase()}.
        </p>
      )}

      {invites.length > 0 && (
        <ul className="invite-list">
          {invites.map((i) => (
            <li key={i.id}>
              <span>
                {ROLE_LABELS[i.role]} · caduca el {formatDate(i.expiresAt)} ·{' '}
                {i.uses === 1 ? '1 uso' : `${i.uses} usos`}
                {i.createdBy && ` · de ${i.createdBy}`}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (created?.id === i.id) setCreated(null);
                  void onRevoke(i.id);
                }}
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Botón en dos pasos (sin diálogos del navegador). */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="secondary danger" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="row">
      <button type="button" className="danger" onClick={() => void onConfirm()}>
        {confirmLabel}
      </button>
      <button type="button" className="secondary" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </div>
  );
}
