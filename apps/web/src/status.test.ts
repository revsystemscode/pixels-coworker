import { describe, expect, it } from 'vitest';
import { toStatusRows } from './status.js';

describe('toStatusRows', () => {
  it('marca todo como "checking" mientras carga', () => {
    expect(toStatusRows('checking', 'checking').every((r) => r.status === 'checking')).toBe(true);
  });

  it('marca la API y sus dependencias como caídas si la API no responde', () => {
    const rows = toStatusRows(null, {
      service: 'game-server',
      status: 'up',
      rooms: 0,
      players: 0,
      load: { eventLoopP99Ms: 1, rssMb: 100 },
    });
    expect(rows.find((r) => r.label === 'Servidor de juego')?.status).toBe('up');
    expect(
      rows.filter((r) => r.label !== 'Servidor de juego').every((r) => r.status === 'down'),
    ).toBe(true);
  });

  it('refleja el estado de cada dependencia', () => {
    const rows = toStatusRows(
      {
        service: 'api',
        status: 'up',
        dependencies: { postgres: 'up', redis: 'down', livekit: 'up' },
      },
      null,
    );
    expect(Object.fromEntries(rows.map((r) => [r.label, r.status]))).toEqual({
      API: 'up',
      'Servidor de juego': 'down',
      PostgreSQL: 'up',
      Redis: 'down',
      LiveKit: 'up',
    });
  });
});
