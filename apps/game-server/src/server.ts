import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GAME_MAX_MESSAGE_BYTES, WORLD_ROOM, type GameServerHealth } from '@pixels/shared';
import { createLoadMonitor } from './load.js';
import { WorldRoom, type WorldRoomDeps } from './rooms/WorldRoom.js';

export interface GameServerOptions extends WorldRoomDeps {
  corsOrigin: string;
}

export function createGameServer({ corsOrigin, ...deps }: GameServerOptions) {
  const load = createLoadMonitor();
  const server = new Server({
    // Los cambios de la pizarra no caben en los 4 KB por mensaje que deja Colyseus por defecto.
    transport: new WebSocketTransport({ maxPayload: GAME_MAX_MESSAGE_BYTES }),
    express: (app) => {
      app.get('/health', async (_req, res) => {
        const rooms = await matchMaker.query({ name: WORLD_ROOM });
        const body: GameServerHealth = {
          service: 'game-server',
          status: 'up',
          rooms: rooms.length,
          players: rooms.reduce((sum, room) => sum + room.clients, 0),
          load: load.snapshot(),
        };
        res.set('Access-Control-Allow-Origin', corsOrigin).json(body);
      });
    },
  });

  // Colyseus crea las salas sin argumentos: las dependencias van en una subclase.
  class SpaceRoom extends WorldRoom {
    protected override deps = deps;
  }
  // Una sala por espacio: quien pide el mismo `spaceId` entra a la misma sala.
  server.define(WORLD_ROOM, SpaceRoom).filterBy(['spaceId']);
  return server;
}
