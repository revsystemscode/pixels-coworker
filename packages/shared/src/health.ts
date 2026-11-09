export type ServiceStatus = 'up' | 'down';

/** Respuesta de GET /health en la API. */
export interface ApiHealth {
  service: 'api';
  status: ServiceStatus;
  dependencies: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    livekit: ServiceStatus;
  };
  /** Versión desplegada (commit) o «dev». */
  version: string;
}

/** Respuesta de GET /health en el servidor de juego. */
export interface GameServerHealth {
  service: 'game-server';
  status: ServiceStatus;
  rooms: number;
  players: number;
  /** Carga del proceso: retraso del bucle de eventos (p99, últimos ~30 s) y memoria. */
  load: {
    eventLoopP99Ms: number;
    rssMb: number;
  };
  version: string;
}
