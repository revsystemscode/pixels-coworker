import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { WORLD_ROOM, type GameServerHealth } from '@pixels/shared';
import { WorldRoom } from './rooms/WorldRoom.js';

export interface GameServerOptions {
  corsOrigin: string;
}

export function createGameServer({ corsOrigin }: GameServerOptions) {
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

  server.define(WORLD_ROOM, WorldRoom);
  return server;
}
