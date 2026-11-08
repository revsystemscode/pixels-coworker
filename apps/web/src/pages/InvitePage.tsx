import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ROLE_LABELS, type AcceptInviteResponse, type InvitePreview } from '@pixels/shared';
import { api, errorMessage } from '../api.js';
import { useSession } from '../auth.js';
import { TopBar } from '../ui/TopBar.js';

/** /i/:token: muestra a qué espacio invita el enlace y une a la persona tras iniciar sesión. */
export function InvitePage() {
  const { token = '' } = useParams();
  const me = useSession((s) => s.me);
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [token]);

  const accept = async () => {
    setJoining(true);
    setError(null);
    try {
      const { spaceId } = await api<AcceptInviteResponse>(
        'POST',
        `/invites/${encodeURIComponent(token)}/accept`,
      );
      navigate(`/s/${spaceId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setJoining(false);
    }
  };

  const here = encodeURIComponent(`/i/${token}`);

  return (
    <>
      <TopBar />
      <main className="page page-center">
        <section className="panel card">
          {preview === undefined && <p className="subtitle">Cargando…</p>}
          {preview === null && (
            <>
              <h1>Invitación no válida</h1>
              <p className="subtitle">
                El enlace no existe, se revocó o ha caducado. Pide uno nuevo a quien te invitó.
              </p>
              <Link to="/">Ir a mis espacios</Link>
            </>
          )}
          {preview && (
            <>
              <h1>Te invitaron a «{preview.spaceName}»</h1>
              <p className="subtitle">Entrarás como {ROLE_LABELS[preview.role].toLowerCase()}.</p>
              {me ? (
                <button type="button" disabled={joining} onClick={() => void accept()}>
                  {joining ? 'Uniéndote…' : 'Unirme al espacio'}
                </button>
              ) : (
                <Link className="button" to={`/login?next=${here}`}>
                  Iniciar sesión para unirte
                </Link>
              )}
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
