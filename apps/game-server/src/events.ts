import { Redis } from 'ioredis';
import { SPACE_EVENTS_CHANNEL, isRole, type SpaceEvent } from '@pixels/shared';

const isSpaceEvent = (value: unknown): value is SpaceEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.spaceId !== 'string') return false;
  if (e.type === 'space-deleted') return true;
  if (typeof e.userId !== 'string') return false;
  return e.type === 'member-removed' || (e.type === 'role-changed' && isRole(e.role));
};

/** Escucha los avisos de la API (expulsiones, cambios de rol, espacios borrados) en Redis. */
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
