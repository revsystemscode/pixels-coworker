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
}

/** Respuesta de GET /health en el servidor de juego. */
export interface GameServerHealth {
  service: 'game-server';
  status: ServiceStatus;
  rooms: number;
  players: number;
}
