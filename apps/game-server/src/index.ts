import { config } from './config.js';
import { createGameServer } from './server.js';

const server = createGameServer({ corsOrigin: config.corsOrigin });
await server.listen(config.port, '0.0.0.0');
console.log(`Servidor de juego escuchando en ws://localhost:${config.port}`);
