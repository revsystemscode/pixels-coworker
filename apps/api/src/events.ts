import { Redis } from 'ioredis';
import { SPACE_EVENTS_CHANNEL, type SpaceEvent } from '@pixels/shared';

export type PublishSpaceEvent = (event: SpaceEvent) => void;

/**
 * Publica los cambios de los espacios en Redis para el servidor de juego. Si Redis no está, se
 * registra el error y la API sigue funcionando (quien fue expulsado sale al recargar).
 */
export function createRedisPublisher(url: string, onError: (err: unknown) => void) {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', onError);
  const publish: PublishSpaceEvent = (event) => {
    redis.publish(SPACE_EVENTS_CHANNEL, JSON.stringify(event)).catch(onError);
  };
  return { publish, close: () => redis.quit().catch(() => {}) };
}
