import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROLE_LABELS, SPACE_NAME_MAX_LENGTH, type SpaceSummary } from '@pixels/shared';
import { api, errorMessage } from '../api.js';
import { TopBar } from '../ui/TopBar.js';

/** «Mis espacios»: los espacios de los que soy miembro y el formulario para crear uno. */
export function HomePage() {
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    api<SpaceSummary[]>('GET', '/spaces')
      .then(setSpaces)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const space = await api<SpaceSummary>('POST', '/spaces', { name: name.trim() });
      navigate(`/s/${space.id}`);
    } catch (err) {
      setCreateError(errorMessage(err));
      setCreating(false);
    }
  };

  return (
    <>
      <TopBar />
      <main className="page">
        <section className="panel">
          <h1>Mis espacios</h1>
          {loadError && (
            <p className="error" role="alert">
              {loadError}
            </p>
          )}
          {spaces === null && !loadError && <p className="subtitle">Cargando…</p>}
          {spaces?.length === 0 && (
            <p className="subtitle">
              Todavía no estás en ningún espacio. Crea uno o abre un enlace de invitación.
            </p>
          )}
          {spaces && spaces.length > 0 && (
            <ul className="space-list">
              {spaces.map((s) => (
                <li key={s.id}>
                  <Link to={`/s/${s.id}`} className="space-link">
                    <span className="space-name">{s.name}</span>
                    <span className="role-badge">{ROLE_LABELS[s.role]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className="panel stack" onSubmit={(e) => void onCreate(e)}>
          <h2>Crear un espacio</h2>
          <p className="subtitle">Empieza con el mapa de la oficina. Tú serás su dueño.</p>
          <div className="row">
            <input
              name="space-name"
              aria-label="Nombre del espacio"
              placeholder="Nombre del espacio"
              value={name}
              maxLength={SPACE_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creando…' : 'Crear'}
            </button>
          </div>
          {createError && (
            <p className="error" role="alert">
              {createError}
            </p>
          )}
        </form>
      </main>
    </>
  );
}
