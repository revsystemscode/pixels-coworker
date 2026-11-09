import { useEffect } from 'react';
import { Link, Route, Routes } from 'react-router';
import { useSession } from './auth.js';
import { EditorPage } from './editor/EditorPage.js';
import { HomePage } from './pages/HomePage.js';
import { InvitePage } from './pages/InvitePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { SpacePage } from './pages/SpacePage.js';
import { Loading, RequireAuth } from './ui/RequireAuth.js';

export function App() {
  const me = useSession((s) => s.me);
  const load = useSession((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  // La invitación se puede ver sin sesión, pero hay que saber si la hay.
  if (me === undefined) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/i/:token" element={<InvitePage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/perfil"
        element={
          <RequireAuth allowNoName>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/s/:spaceId"
        element={
          <RequireAuth>
            <SpacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/s/:spaceId/editor"
        element={
          <RequireAuth>
            <EditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <main className="page page-center">
            <section className="panel card">
              <h1>Página no encontrada</h1>
              <Link to="/">Ir a mis espacios</Link>
            </section>
          </main>
        }
      />
    </Routes>
  );
}
