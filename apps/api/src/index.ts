import { buildApp } from './app.js';
import { config } from './config.js';
import { createHealthChecks } from './health.js';

const app = await buildApp({
  corsOrigin: config.corsOrigin,
  healthChecks: createHealthChecks(config),
  logger: true,
});

await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
