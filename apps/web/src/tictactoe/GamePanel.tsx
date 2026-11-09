import { useEffect } from 'react';
import { ClientMessage, MARKS, type GameStateMessage, type Mark } from '@pixels/shared';
import { useGame } from './store.js';

/** Mesa de tres en raya abierta: dos juegan y el resto mira. */
export function GamePanel({ selfId }: { selfId: string }) {
  const open = useGame((s) => s.open);
  const state = useGame((s) => s.state);
  const error = useGame((s) => s.error);
  const close = useGame((s) => s.close);
  const send = useGame((s) => s.send);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  const mine = state ? (MARKS.find((m) => state.seats[m]?.sessionId === selfId) ?? null) : null;
  const myTurn =
    !!state &&
    !!mine &&
    !state.outcome &&
    !!state.seats.X &&
    !!state.seats.O &&
    state.turn === mine;
  const line = state?.outcome && state.outcome.winner !== 'draw' ? state.outcome.line : [];

  return (
    <section className="panel object-panel game-panel" role="dialog" aria-label={open.name}>
      <header className="object-header">
        <div>
          <span className="object-kind">Tres en raya</span>
          <h2>{open.name}</h2>
        </div>
        <button type="button" className="secondary" onClick={() => close()}>
          Cerrar
        </button>
      </header>
      {!state ? (
        <p className="object-empty">Acercándote a la mesa…</p>
      ) : (
        <>
          <ul className="game-seats" aria-label="Jugadores">
            {MARKS.map((mark) => (
              <li key={mark}>
                <span className={`game-mark mark-${mark}`}>{mark}</span>
                {state.seats[mark] ? (
                  <span>
                    {state.seats[mark].name}
                    {mark === mine && ' (tú)'}
                  </span>
                ) : (
                  <span className="object-empty">Asiento libre</span>
                )}
              </li>
            ))}
          </ul>
          <p className="game-status" role="status">
            {statusText(state, mine, myTurn)}
          </p>
          <div className="game-board" role="group" aria-label="Tablero">
            {state.board.map((cell, i) => (
              <button
                key={i}
                type="button"
                className={`game-cell${cell ? ` mark-${cell}` : ''}${line.includes(i) ? ' win' : ''}`}
                aria-label={`Casilla ${i + 1}: ${cell ?? 'vacía'}`}
                disabled={!myTurn || cell !== null}
                onClick={() => send(ClientMessage.GameMove, { cell: i })}
              >
                {cell}
              </button>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="object-actions">
            <span className="game-watching">
              {state.watching === 1 ? 'Solo tú en la mesa' : `${state.watching} en la mesa`}
            </span>
            {!mine && (!state.seats.X || !state.seats.O) && (
              <button type="button" onClick={() => send(ClientMessage.GameSit)}>
                Sentarme a jugar
              </button>
            )}
            {mine && state.outcome && (
              <button type="button" onClick={() => send(ClientMessage.GameRematch)}>
                Otra partida
              </button>
            )}
            {mine && (
              <button
                type="button"
                className="secondary"
                onClick={() => send(ClientMessage.GameStand)}
              >
                Levantarme
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function statusText(state: GameStateMessage, mine: Mark | null, myTurn: boolean): string {
  const name = (mark: Mark) => state.seats[mark]?.name ?? mark;
  const { outcome } = state;
  if (outcome?.winner === 'draw') return 'Empate.';
  if (outcome)
    return outcome.winner === mine ? '¡Has ganado!' : `Ha ganado ${name(outcome.winner)}.`;
  if (!state.seats.X || !state.seats.O) {
    return mine
      ? 'Esperando a que se siente otra persona…'
      : 'Siéntate para jugar o quédate mirando.';
  }
  if (myTurn) return `Te toca (${mine}).`;
  return `Turno de ${name(state.turn)} (${state.turn}).`;
}
