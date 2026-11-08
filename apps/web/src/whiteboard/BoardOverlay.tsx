import { Suspense, lazy, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { useMedia } from '../media/store.js';
import { useApp } from '../store.js';
import { AvatarPreview } from '../ui/AvatarPreview.js';
import { MicIcon } from '../ui/icons.js';
import { useBoard } from './store.js';

// Excalidraw pesa mucho: solo se descarga al abrir la primera pizarra.
const BoardCanvas = lazy(() => import('./BoardCanvas.js'));

/** Pizarra abierta, a pantalla completa sobre el mapa. */
export function BoardOverlay({ selfId }: { selfId: string }) {
  const open = useBoard((s) => s.open);
  const status = useBoard((s) => s.status);
  const viewers = useBoard((s) => s.viewers);
  const notice = useBoard((s) => s.notice);
  const close = useBoard((s) => s.close);
  if (!open) return null;

  const loading = <p className="board-loading">Abriendo la pizarra…</p>;
  return (
    <section className="board-overlay" role="dialog" aria-modal="true" aria-label={open.board.name}>
      <header className="board-header">
        <h2>{open.board.name}</h2>
        <ul className="board-viewers" aria-label="En la pizarra">
          {viewers.map((v) => (
            <li key={v.sessionId} title={v.name}>
              <AvatarPreview avatar={v.avatar} scale={1.5} />
              <span className="board-viewer-name">
                {v.name}
                {v.sessionId === selfId && ' (tú)'}
              </span>
            </li>
          ))}
        </ul>
        {notice && (
          <p className="board-notice" role="alert">
            {notice}
          </p>
        )}
        <MicToggle />
        <button type="button" className="secondary" onClick={() => close()}>
          Cerrar pizarra
        </button>
      </header>
      <div className="board-canvas">
        {status === 'ready' ? (
          <Suspense fallback={loading}>
            <BoardCanvas key={open.id} connection={open} selfId={selfId} />
          </Suspense>
        ) : (
          loading
        )}
      </div>
    </section>
  );
}

/** Silenciar el micrófono sin cerrar la pizarra (la barra de video queda debajo). */
function MicToggle() {
  const media = useApp((s) => s.media);
  const ready = useMedia((s) => s.status === 'connected');
  const micOn = useMedia((s) => s.micOn);
  const [busy, setBusy] = useState(false);
  if (!media || !ready) return null;
  const label = micOn ? 'Silenciar micrófono' : 'Activar micrófono';
  return (
    <button
      type="button"
      className={`icon-button${micOn ? '' : ' off'}`}
      aria-pressed={micOn}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void media.setMicrophone(!micOn).finally(() => setBusy(false));
      }}
    >
      <MicIcon off={!micOn} />
    </button>
  );
}

/** Aviso para abrir la pizarra que tenemos cerca (o por qué se cerró). */
export function BoardPrompt({ room }: { room: Room }) {
  const near = useBoard((s) => s.near);
  const open = useBoard((s) => s.open);
  const notice = useBoard((s) => s.notice);
  const openBoard = useBoard((s) => s.openBoard);
  if (open) return null;
  if (notice) {
    return (
      <p className="board-prompt" role="status">
        {notice}
      </p>
    );
  }
  if (!near) return null;
  return (
    <button type="button" className="board-prompt" onClick={() => openBoard(room, near)}>
      Abrir «{near.name}» <kbd>E</kbd>
    </button>
  );
}
