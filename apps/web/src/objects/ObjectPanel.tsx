import { useEffect, useState, type FormEvent } from 'react';
import type { Room } from '@colyseus/sdk';
import {
  EDITABLE_KINDS,
  NOTE_MAX_LENGTH,
  URL_MAX_LENGTH,
  canEditObjects,
  parseObjectValue,
  videoEmbedUrl,
  videoPageUrl,
  type MapObject,
} from '@pixels/shared';
import { useApp } from '../store.js';
import { useObjects } from './store.js';

const KIND_LABELS = { link: 'Enlace', video: 'Video', note: 'Nota', game: 'Juego' } as const;

/** Panel del objeto abierto (enlace, video o nota). El mapa sigue visible y se puede andar. */
export function ObjectPanel({ room }: { room: Room }) {
  const open = useObjects((s) => s.open);
  const close = useObjects((s) => s.close);

  // Escape cierra el panel (salvo mientras se escribe: ahí cancela la edición).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !typing) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || open.kind === 'game') return null;
  return <ObjectView key={open.id} room={room} object={open} />;
}

function ObjectView({ room, object }: { room: Room; object: MapObject }) {
  const value = useObjects((s) => s.contents[object.id] ?? '');
  const close = useObjects((s) => s.close);
  const role = useApp((s) => s.space?.role);
  const canEdit = !!role && canEditObjects(role) && EDITABLE_KINDS.includes(object.kind);
  const [editing, setEditing] = useState(false);

  return (
    <section
      className={`panel object-panel object-${object.kind}`}
      role="dialog"
      aria-label={object.name}
    >
      <header className="object-header">
        <div>
          <span className="object-kind">{KIND_LABELS[object.kind]}</span>
          <h2>{object.name}</h2>
        </div>
        {canEdit && !editing && (
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
        <button type="button" className="secondary" onClick={() => close()}>
          Cerrar
        </button>
      </header>
      {editing ? (
        <ObjectEditor room={room} object={object} value={value} onDone={() => setEditing(false)} />
      ) : (
        <ObjectContent object={object} value={value} canEdit={canEdit} />
      )}
    </section>
  );
}

function ObjectContent({
  object,
  value,
  canEdit,
}: {
  object: MapObject;
  value: string;
  canEdit: boolean;
}) {
  const empty = (what: string) => (
    <p className="object-empty">
      {what}
      {canEdit ? ' Pulsa «Editar» para añadirlo.' : ''}
    </p>
  );

  if (object.kind === 'note') {
    return value ? <p className="object-note">{value}</p> : empty('La nota está vacía.');
  }

  if (object.kind === 'link') {
    if (!value) return empty('Todavía no hay ningún enlace.');
    const url = new URL(value);
    return (
      <div className="object-link">
        <p className="subtitle">Se abrirá en otra pestaña:</p>
        <p className="object-url">
          <strong>{url.host}</strong>
          {url.href.slice(url.origin.length)}
        </p>
        <a className="button" href={url.href} target="_blank" rel="noopener noreferrer">
          Abrir enlace
        </a>
      </div>
    );
  }

  const embed = videoEmbedUrl(value);
  const page = videoPageUrl(value);
  if (!embed) return empty('Todavía no hay ningún video.');
  return (
    <>
      <div className="object-video">
        <iframe
          src={embed}
          title={object.name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
      {page && (
        <a className="muted-link" href={page} target="_blank" rel="noopener noreferrer">
          Ver en {value.startsWith('youtube:') ? 'YouTube' : 'Vimeo'}
        </a>
      )}
    </>
  );
}

function ObjectEditor({
  room,
  object,
  value,
  onDone,
}: {
  room: Room;
  object: MapObject;
  value: string;
  onDone: () => void;
}) {
  const saving = useObjects((s) => s.saving === object.id);
  const serverError = useObjects((s) => s.error);
  const save = useObjects((s) => s.save);
  const [draft, setDraft] = useState(() =>
    object.kind === 'video' ? (videoPageUrl(value) ?? '') : value,
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // El servidor confirmó el cambio (dejó de guardar sin error): se vuelve a ver el contenido.
  useEffect(() => {
    if (sent && !saving && !serverError) onDone();
  }, [sent, saving, serverError, onDone]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseObjectValue(object.kind, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSent(true);
    save(room, object.id, draft);
  };

  const label =
    object.kind === 'note'
      ? 'Texto de la nota'
      : object.kind === 'link'
        ? 'Dirección web'
        : 'Enlace de YouTube o Vimeo';
  const shown = error ?? (sent ? serverError : null);

  return (
    <form className="object-editor" onSubmit={onSubmit}>
      <label className="field">
        <span>{label}</span>
        {object.kind === 'note' ? (
          <textarea
            value={draft}
            rows={6}
            maxLength={NOTE_MAX_LENGTH}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            type="text"
            inputMode="url"
            value={draft}
            maxLength={URL_MAX_LENGTH}
            placeholder={object.kind === 'link' ? 'https://…' : 'https://www.youtube.com/watch?v=…'}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
      </label>
      {object.kind !== 'note' && (
        <p className="subtitle">
          Déjalo vacío para quitar el {object.kind === 'link' ? 'enlace' : 'video'}.
        </p>
      )}
      {shown && (
        <p className="error" role="alert">
          {shown}
        </p>
      )}
      <div className="object-actions">
        <button type="button" className="secondary" onClick={onDone} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

/** Aviso para abrir el objeto que tenemos cerca (o por qué se cerró). */
export function ObjectPrompt() {
  const near = useObjects((s) => s.near);
  const open = useObjects((s) => s.open);
  const notice = useObjects((s) => s.notice);
  const openObject = useObjects((s) => s.openObject);
  if (notice && !open) {
    return (
      <p className="board-prompt" role="status">
        {notice}
      </p>
    );
  }
  if (!near || open?.id === near.id) return null;
  return (
    <button type="button" className="board-prompt" onClick={() => openObject(near)}>
      Abrir «{near.name}» <kbd>E</kbd>
    </button>
  );
}
