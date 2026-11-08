import { useState, type FormEvent } from 'react';
import { AVATAR_COUNT, NAME_MAX_LENGTH } from '@pixels/shared';
import { useApp } from '../store.js';
import { AvatarPreview } from './AvatarPreview.js';
import { MediaSetup } from './MediaSetup.js';
import { StatusPanel } from './StatusPanel.js';

const STORAGE_KEY = 'pixels.profile';

function loadProfile(): { name: string; avatar: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      name?: unknown;
      avatar?: unknown;
    };
    return {
      name: typeof saved.name === 'string' ? saved.name : '',
      avatar: typeof saved.avatar === 'number' ? saved.avatar : 0,
    };
  } catch {
    return { name: '', avatar: 0 };
  }
}

function saveProfile(profile: { name: string; avatar: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Sin almacenamiento disponible (modo privado): no pasa nada.
  }
}

export function JoinScreen() {
  const initial = loadProfile();
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar);
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const join = useApp((s) => s.join);
  const connecting = phase === 'connecting';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveProfile({ name: trimmed, avatar });
    void join({ name: trimmed, avatar });
  };

  return (
    <main className="join">
      <form className="panel join-card" onSubmit={onSubmit}>
        <h1>pixels-coworker</h1>
        <p className="subtitle">Elige tu nombre y tu avatar para entrar a la oficina.</p>

        <MediaSetup />

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

        <fieldset className="avatars">
          <legend>Avatar</legend>
          {Array.from({ length: AVATAR_COUNT }, (_, i) => (
            <label key={i} className={`avatar-option${avatar === i ? ' selected' : ''}`}>
              <input
                type="radio"
                name="avatar"
                value={i}
                checked={avatar === i}
                onChange={() => setAvatar(i)}
                aria-label={`Avatar ${i + 1}`}
              />
              <AvatarPreview avatar={i} />
            </label>
          ))}
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={connecting || !name.trim()}>
          {connecting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      {import.meta.env.DEV && <StatusPanel />}
    </main>
  );
}
