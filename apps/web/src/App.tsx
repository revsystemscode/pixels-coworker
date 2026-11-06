import { useEffect, useState } from 'react';
import type { ApiHealth, GameServerHealth } from '@pixels/shared';
import { env } from './env.js';
import { GameCanvas } from './game/GameCanvas.js';
import { toStatusRows } from './status.js';

const POLL_MS = 3000;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [api, setApi] = useState<ApiHealth | null | 'checking'>('checking');
  const [game, setGame] = useState<GameServerHealth | null | 'checking'>('checking');

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const [a, g] = await Promise.all([
        fetchJson<ApiHealth>(`${env.apiUrl}/health`),
        fetchJson<GameServerHealth>(`${env.gameServerUrl}/health`),
      ]);
      if (!active) return;
      setApi(a);
      setGame(g);
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const players = game && game !== 'checking' ? game.players : null;

  return (
    <main className="layout">
      <header>
        <h1>pixels-coworker</h1>
        <p className="subtitle">Fase 0 · entorno de desarrollo</p>
      </header>

      <section className="panel" aria-label="Estado de los servicios">
        <h2>Servicios</h2>
        <ul className="status-list">
          {toStatusRows(api, game).map((row) => (
            <li key={row.label}>
              <span className={`dot dot-${row.status}`} aria-hidden="true" />
              <span>{row.label}</span>
              <span className="status-text">{row.status}</span>
            </li>
          ))}
        </ul>
        {players !== null && <p className="players">Jugadores conectados: {players}</p>}
      </section>

      <section className="panel game" aria-label="Mundo">
        <GameCanvas />
      </section>
    </main>
  );
}
