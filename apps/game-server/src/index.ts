import { reportError } from './instrument.js';
import { createDb } from '@pixels/db';
import { config } from './config.js';
import { subscribeSpaceEvents } from './events.js';
import { handleSpaceEvent } from './rooms/WorldRoom.js';
import { createGameServer } from './server.js';
import { createDbSpaceStore } from './store.js';

const db = createDb(config.databaseUrl);
const server = createGameServer({
  corsOrigin: config.corsOrigin,
  store: createDbSpaceStore(db),
  ticketSecret: config.ticketSecret,
  maxClients: config.roomMaxClients,
  onError: reportError,
});
const unsubscribe = subscribeSpaceEvents(config.redisUrl, handleSpaceEvent, (err) =>
  reportError('Redis (eventos de espacios)', err),
);

await server.listen(config.port, '0.0.0.0');
console.log(`Servidor de juego escuchando en ws://localhost:${config.port}`);

server.onShutdown(async () => {
  await unsubscribe();
  await db.$disconnect();
});
