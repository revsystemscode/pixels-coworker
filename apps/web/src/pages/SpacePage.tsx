import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { SpaceSummary } from '@pixels/shared';
import { ApiRequestError, api, errorMessage } from '../api.js';
import { useSession } from '../auth.js';
import { useApp } from '../store.js';
import { AvatarPreview } from '../ui/AvatarPreview.js';
import { MediaSetup } from '../ui/MediaSetup.js';
import { TopBar } from '../ui/TopBar.js';
import { WorldScreen } from '../ui/WorldScreen.js';

/** /s/:spaceId: pantalla previa (cámara y micro) y, al entrar, el mapa del espacio. */
export function SpacePage() {
  const { spaceId = '' } = useParams();
  const me = useSession((s) => s.me)!;
  const phase = useApp((s) => s.phase);
  const room = useApp((s) => s.room);
  const map = useApp((s) => s.map);
  const error = useApp((s) => s.error);
  const join = useApp((s) => s.join);
  const leave = useApp((s) => s.leave);
  // Lo cargado se guarda con su id: al cambiar de espacio se ve «Cargando…» hasta tener el nuevo.
  const [loaded, setLoaded] = useState<{
    id: string;
    space: SpaceSummary | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    api<SpaceSummary>('GET', `/spaces/${spaceId}`)
      .then((space) => active && setLoaded({ id: spaceId, space, error: null }))
      .catch((err: unknown) => {
        if (!active) return;
        const missing = err instanceof ApiRequestError && err.status === 404;
        setLoaded({ id: spaceId, space: null, error: missing ? null : errorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, [spaceId]);

  const current = loaded?.id === spaceId ? loaded : null;
  const loadError = current?.error ?? null;
  /** undefined: cargando; null: no existe o no soy miembro. */
  const space = current ? (loadError ? undefined : current.space) : undefined;

  // Al salir de la página (o cambiar de espacio), se sale de la sala.
  useEffect(() => () => void useApp.getState().leave(), [spaceId]);

  if (phase === 'world' && room && map) return <WorldScreen room={room} map={map} />;

  return (
    <>
      <TopBar />
      <main className="page page-center">
        <section className="panel card">
          {space === undefined && !loadError && <p className="subtitle">Cargando…</p>}
          {loadError && (
            <p className="error" role="alert">
              {loadError}
            </p>
          )}
          {space === null && !loadError && (
            <>
              <h1>Espacio no encontrado</h1>
              <p className="subtitle">
                No existe o no eres miembro. Si te invitaron, abre el enlace de invitación.
              </p>
              <Link to="/">Ir a mis espacios</Link>
            </>
          )}
          {space && (
            <>
              <h1>{space.name}</h1>
              <p className="subtitle you">
                <AvatarPreview avatar={me.avatar} scale={2} />
                <span>
                  Entrarás como <strong>{me.name}</strong>.{' '}
                  <Link to={`/perfil?next=/s/${space.id}`}>Cambiar</Link>
                </span>
              </p>
              <MediaSetup />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={phase === 'connecting'}
                onClick={() => void join(space.id, me.name)}
              >
                {phase === 'connecting' ? 'Entrando…' : 'Entrar'}
              </button>
              <Link to="/" className="muted-link" onClick={() => void leave()}>
                Volver a mis espacios
              </Link>
            </>
          )}
        </section>
      </main>
    </>
  );
}
