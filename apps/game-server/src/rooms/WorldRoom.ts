import { Room, type Client } from '@colyseus/core';
import { MAX_PLAYERS_PER_ROOM, SERVER_TICK_RATE, tileToPixel } from '@pixels/shared';
import { Player, WorldState } from './WorldState.js';

export interface JoinOptions {
  name?: string;
}

const SPAWN_TILE = { x: 5, y: 5 };
const MAX_NAME_LENGTH = 24;

export class WorldRoom extends Room<{ state: WorldState }> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override patchRate = 1000 / SERVER_TICK_RATE;
  override state = new WorldState();

  override onJoin(client: Client, options?: JoinOptions) {
    const name = options?.name?.trim().slice(0, MAX_NAME_LENGTH) || 'Invitado';
    const spawn = tileToPixel(SPAWN_TILE);
    this.state.players.set(client.sessionId, new Player({ name, x: spawn.x, y: spawn.y }));
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
