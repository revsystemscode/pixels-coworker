import { useState } from 'react';
import { useMedia } from '../media/store.js';
import { VideoView } from './VideoView.js';

/**
 * Panel grande con la pantalla que comparte alguien cercano. Si hay varias, se elige con pestañas.
 * La propia no se muestra (sería un espejo infinito); la barra de controles avisa de que se comparte.
 */
export function ScreenShares() {
  const peers = useMedia((s) => s.peers);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const shares = Object.values(peers).filter((p) => p.screen);
  const current = shares.find((p) => p.id === selected) ?? shares[0];

  return (
    <>
      {current?.screen && (
        <section
          className={`panel screen-panel${hidden ? ' collapsed' : ''}`}
          aria-label="Pantalla compartida"
        >
          <header className="screen-header">
            {shares.length > 1 ? (
              <div role="tablist" className="screen-tabs">
                {shares.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={p.id === current.id}
                    className="secondary"
                    onClick={() => setSelected(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : (
              <strong>Pantalla de {current.name}</strong>
            )}
            <button type="button" className="secondary" onClick={() => setHidden((h) => !h)}>
              {hidden ? 'Mostrar' : 'Ocultar'}
            </button>
          </header>
          {!hidden && (
            <VideoView
              track={current.screen}
              className="screen-video"
              label={`Pantalla de ${current.name}`}
            />
          )}
        </section>
      )}
    </>
  );
}
