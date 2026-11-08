import { useMedia } from '../media/store.js';

/** Aviso de que estamos dentro de una zona privada. */
export function ZoneBadge() {
  const zone = useMedia((s) => s.zone);
  if (!zone) return null;
  return (
    <span className="zone-badge" role="status">
      {zone} · privada
    </span>
  );
}
