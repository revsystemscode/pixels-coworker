import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { NAME_MAX_LENGTH } from '@pixels/shared';
import { errorMessage } from '../api.js';
import { useSession } from '../auth.js';
import { AvatarPicker } from '../ui/AvatarPicker.js';
import { safeNext } from '../ui/RequireAuth.js';
import { TopBar } from '../ui/TopBar.js';

export function ProfilePage() {
  const me = useSession((s) => s.me)!;
  const saveProfile = useSession((s) => s.saveProfile);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const isNew = !me.name;
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile({ name: name.trim(), avatar });
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar />
      <main className="page page-center">
        <form className="panel card" onSubmit={(e) => void onSubmit(e)}>
          <h1>{isNew ? 'Elige cómo te verán' : 'Tu perfil'}</h1>
          <p className="subtitle">
            Tu nombre y tu avatar se ven en el mapa. Entraste como {me.email}.
          </p>
          <label className="field">
            <span>Nombre</span>
            <input
              name="name"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="nickname"
              autoFocus
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Guardando…' : isNew ? 'Continuar' : 'Guardar'}
          </button>
        </form>
      </main>
    </>
  );
}
