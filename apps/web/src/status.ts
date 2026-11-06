import type { ApiHealth, GameServerHealth, ServiceStatus } from '@pixels/shared';

export interface StatusRow {
  label: string;
  status: ServiceStatus | 'checking';
}

/** Convierte las respuestas de /health en filas para el panel de estado. */
export function toStatusRows(
  api: ApiHealth | null | 'checking',
  game: GameServerHealth | null | 'checking',
): StatusRow[] {
  const dep = (key: keyof ApiHealth['dependencies']): StatusRow['status'] =>
    api === 'checking' ? 'checking' : (api?.dependencies[key] ?? 'down');

  return [
    { label: 'API', status: api === 'checking' ? 'checking' : api ? 'up' : 'down' },
    { label: 'Servidor de juego', status: game === 'checking' ? 'checking' : game ? 'up' : 'down' },
    { label: 'PostgreSQL', status: dep('postgres') },
    { label: 'Redis', status: dep('redis') },
    { label: 'LiveKit', status: dep('livekit') },
  ];
}
