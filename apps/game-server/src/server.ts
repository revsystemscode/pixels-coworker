import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { WORLD_ROOM, type GameServerHealth } from '@pixels/shared';
import { WorldRoom, type WorldRoomDeps } from './rooms/WorldRoom.js';

export interface GameServerOptions extends WorldRoomDeps {
  corsOrigin: string;
}

export function createGameServer({ corsOrigin, ...deps }: GameServerOptions) {
  const server = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
      app.get('/health', async (_req, res) => {
        const rooms = await matchMaker.query({ name: WORLD_ROOM });
        const body: GameServerHealth = {
          service: 'game-server',
          status: 'up',
          rooms: rooms.length,
          players: rooms.reduce((sum, room) => sum + room.clients, 0),
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
