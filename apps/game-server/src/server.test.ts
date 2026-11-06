import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORLD_ROOM, type GameServerHealth } from '@pixels/shared';
import { createGameServer } from './server.js';

const PORT = 25670;
const server = createGameServer({ corsOrigin: 'http://localhost:5173' });

beforeAll(async () => {
  await server.listen(PORT, '127.0.0.1');
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function health(): Promise<GameServerHealth> {
  const res = await fetch(`http://127.0.0.1:${PORT}/health`);
  return (await res.json()) as GameServerHealth;
}

describe('servidor de juego', () => {
  it('responde /health sin salas', async () => {
    expect(await health()).toEqual({ service: 'game-server', status: 'up', rooms: 0, players: 0 });
  });

  it('dos clientes entran a la misma sala y se ven', async () => {
    const client = new Client(`ws://127.0.0.1:${PORT}`);
    const alice = await client.joinOrCreate(WORLD_ROOM, { name: 'Alice' });
    const bob = await client.joinOrCreate(WORLD_ROOM, { name: '  Bob  ' });

    expect(bob.roomId).toBe(alice.roomId);

    await expect.poll(() => alice.state.players?.size).toBe(2);
    const names = [...alice.state.players.values()].map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
    expect(await health()).toMatchObject({ rooms: 1, players: 2 });

    await bob.leave();
    await expect.poll(() => alice.state.players.size).toBe(1);
    await alice.leave();
  });
});
