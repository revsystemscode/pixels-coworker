/**
 * Tiempo que se mantiene la conexión con alguien que acaba de salir del radio (con volumen 0 y sin
 * video). Si vuelve a entrar en ese tiempo no hay que renegociar nada; así no hay cortes cuando
 * alguien camina justo por el borde.
 */
export const LEAVE_GRACE_MS = 1500;

/**
 * Recuerda a quién se oía hace poco. `update` recibe a quién se oye ahora (con su volumen) y
 * devuelve con quién hay que estar conectado: los que se oyen y, con volumen 0, los que salieron
 * del radio hace menos de LEAVE_GRACE_MS.
 */
export class ProximityTracker {
  private lastHeard = new Map<string, number>();

  constructor(private readonly graceMs = LEAVE_GRACE_MS) {}

  update(audible: ReadonlyMap<string, number>, now: number): Map<string, number> {
    const connected = new Map(audible);
    for (const id of audible.keys()) this.lastHeard.set(id, now);
    for (const [id, at] of this.lastHeard) {
      if (audible.has(id)) continue;
      if (now - at < this.graceMs) connected.set(id, 0);
      else this.lastHeard.delete(id);
    }
    return connected;
  }

  forget(id: string) {
    this.lastHeard.delete(id);
  }
}

/** True si dos mapas de id → volumen tienen las mismas claves. */
export function sameKeys(a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>) {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}
