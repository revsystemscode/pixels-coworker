import { Link, useNavigate } from 'react-router';
import { useSession } from '../auth.js';
import { AvatarPreview } from './AvatarPreview.js';

/** Barra superior de las páginas fuera del mapa. */
export function TopBar() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        pixels-coworker
      </Link>
      {me && (
        <nav className="topbar-user">
          <Link to="/perfil" className="topbar-profile" title="Editar perfil">
            <AvatarPreview avatar={me.avatar} scale={2} />
            <span>{me.name || me.email}</span>
          </Link>
          <button
            type="button"
            className="secondary"
            onClick={() => void signOut().then(() => navigate('/login'))}
          >
            Cerrar sesión
          </button>
        </nav>
      )}
    </header>
  );
}
