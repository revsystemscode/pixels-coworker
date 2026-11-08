import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../auth.js';

/** Solo rutas internas: evita que `?next=` mande a otra web tras el login. */
export function safeNext(next: string | null, fallback = '/'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : fallback;
}

export function Loading() {
  return (
    <main className="page page-center">
      <p className="subtitle" role="status">
        Cargando…
      </p>
    </main>
  );
}

/**
 * Exige sesión (si no, al login) y un perfil con nombre (si no, a elegirlo). Después vuelve a la
 * página que se pidió.
 */
export function RequireAuth({
  children,
  allowNoName = false,
}: {
  children: ReactNode;
  allowNoName?: boolean;
}) {
  const me = useSession((s) => s.me);
  const location = useLocation();
  if (me === undefined) return <Loading />;
  const here = encodeURIComponent(location.pathname + location.search);
  if (!me) return <Navigate to={`/login?next=${here}`} replace />;
  if (!me.name && !allowNoName) return <Navigate to={`/perfil?next=${here}`} replace />;
  return children;
}
