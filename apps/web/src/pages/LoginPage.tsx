import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import type { AuthOptionsResponse } from '@pixels/shared';
import { api } from '../api.js';
import { authClient, useSession, webUrl } from '../auth.js';
import { safeNext } from '../ui/RequireAuth.js';
import { StatusPanel } from '../ui/StatusPanel.js';

const MAILPIT_URL = 'http://localhost:8025';

/** Mensajes para los errores con los que Better Auth vuelve a la web. */
function describeAuthError(code: string) {
  if (/TOKEN/i.test(code)) return 'El enlace no es válido o ya se usó. Pide otro.';
  if (/signup_disabled|access_denied/i.test(code)) return 'No se pudo iniciar sesión.';
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

export function LoginPage() {
  const me = useSession((s) => s.me);
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('error') ? describeAuthError(params.get('error')!) : null,
  );
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api<AuthOptionsResponse>('GET', '/auth/options')
      .then((o) => setGoogle(o.google))
      .catch(() => setGoogle(false));
  }, []);

  if (me) return <Navigate to={next} replace />;

  const errorCallbackURL = webUrl(`/login?next=${encodeURIComponent(next)}`);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email: trimmed,
      callbackURL: webUrl(next),
      errorCallbackURL,
    });
    setSending(false);
    if (error) {
      setError(
        error.status === 429
          ? 'Demasiados intentos. Espera un minuto.'
          : 'No se pudo enviar el correo. Revisa la dirección.',
      );
    } else setSentTo(trimmed);
  };

  const onGoogle = async () => {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: webUrl(next),
      errorCallbackURL,
    });
    if (error) setError('No se pudo iniciar sesión con Google.');
  };

  return (
    <main className="page page-center">
      <section className="panel card">
        <h1>pixels-coworker</h1>
        <p className="subtitle">Inicia sesión para entrar a tus espacios.</p>

        {sentTo ? (
          <div className="sent" role="status">
            <p>
              Te enviamos un enlace a <strong>{sentTo}</strong>. Ábrelo en este navegador para
              entrar (caduca en 15 minutos).
            </p>
            {import.meta.env.DEV && (
              <p className="subtitle">
                En desarrollo los correos llegan a{' '}
                <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
                  Mailpit
                </a>
                .
              </p>
            )}
            <button type="button" className="link-button" onClick={() => setSentTo(null)}>
              Usar otro correo
            </button>
          </div>
        ) : (
          <>
            {google && (
              <>
                <button type="button" className="google" onClick={() => void onGoogle()}>
                  Continuar con Google
                </button>
                <p className="divider">
                  <span>o con tu correo</span>
                </p>
              </>
            )}
            <form className="stack" onSubmit={(e) => void onSubmit(e)}>
              <label className="field">
                <span>Correo</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  autoComplete="email"
                  autoFocus
                  required
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" disabled={sending || !email.trim()}>
                {sending ? 'Enviando…' : 'Enviarme un enlace'}
              </button>
            </form>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {import.meta.env.DEV && <StatusPanel />}
    </main>
  );
}
