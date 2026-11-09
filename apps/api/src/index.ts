import { createDb } from '@pixels/db';
import { buildApp } from './app.js';
import { config } from './config.js';
import { createRedisPublisher } from './events.js';
import { createHealthChecks } from './health.js';
import { createSmtpMailer } from './mail.js';

const db = createDb(config.databaseUrl);
const events = createRedisPublisher(config.redisUrl, (err) =>
  console.error('Redis (eventos de espacios):', err),
);

const app = await buildApp({
  corsOrigin: config.corsOrigin,
  healthChecks: createHealthChecks(config),
  media: config.media,
  db,
  auth: { ...config.auth, mailer: createSmtpMailer(config.mail.smtpUrl, config.mail.from) },
  publish: events.publish,
  logger: true,
  rateLimitPerMinute: config.rateLimitPerMinute,
  trustProxy: config.trustProxy,
});

await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => Promise.all([db.$disconnect(), events.close()]))
      .then(() => process.exit(0));
  });
}
