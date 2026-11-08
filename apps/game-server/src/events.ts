import { Redis } from 'ioredis';
import { SPACE_EVENTS_CHANNEL, type SpaceEvent } from '@pixels/shared';

const isSpaceEvent = (value: unknown): value is SpaceEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.spaceId !== 'string') return false;
  return (
    e.type === 'space-deleted' || (e.type === 'member-removed' && typeof e.userId === 'string')
  );
};

/** Escucha los avisos de la API (expulsiones, espacios borrados) en Redis. */
export function subscribeSpaceEvents(
  url: string,
  onEvent: (event: SpaceEvent) => void,
  onError: (err: unknown) => void,
) {
  const redis = new Redis(url);
  redis.on('error', onError);
  redis.subscribe(SPACE_EVENTS_CHANNEL).catch(onError);
  redis.on('message', (_channel, raw: string) => {
    try {
      const event: unknown = JSON.parse(raw);
      if (isSpaceEvent(event)) onEvent(event);
    } catch {
      // Mensaje mal formado: se ignora.
    }
  });
  return () => redis.quit().catch(() => {});
}
