import { applyStep, type Direction, type Point, type WorldMap } from '@pixels/shared';

interface PendingStep {
  seq: number;
  dir: Direction;
}

export interface ServerPlayer {
  x: number;
  y: number;
  seq: number;
}

/**
 * Predicción del movimiento propio en el cliente.
 *
 * Cada paso se aplica al instante (sin esperar al servidor) y se guarda como pendiente.
 * Cuando llega el estado del servidor se descartan los pasos ya confirmados, se reaplican
 * los pendientes sobre la posición del servidor y, si el resultado no coincide con lo
 * predicho (por ejemplo, el servidor frenó un paso), se corrige la posición.
 */
export class Predictor {
  position: Point;
  private seq: number;
  private pending: PendingStep[] = [];

  constructor(
    private readonly map: WorldMap,
    start: ServerPlayer,
  ) {
    this.position = { x: start.x, y: start.y };
    this.seq = start.seq;
  }

  /** Registra un paso. Devuelve el número de secuencia y la casilla nueva (o null si hay pared). */
  step(dir: Direction): { seq: number; next: Point | null } {
    const seq = ++this.seq;
    this.pending.push({ seq, dir });
    const next = applyStep(this.map, this.position, dir);
    if (next) this.position = next;
    return { seq, next };
  }

  /** Aplica el estado del servidor. Devuelve la posición corregida si había diferencia, o null. */
  reconcile(server: ServerPlayer): Point | null {
    this.pending = this.pending.filter((p) => p.seq > server.seq);
    let pos: Point = { x: server.x, y: server.y };
    for (const p of this.pending) pos = applyStep(this.map, pos, p.dir) ?? pos;

    if (pos.x === this.position.x && pos.y === this.position.y) return null;
    this.position = pos;
    return pos;
  }

  get pendingCount() {
    return this.pending.length;
  }
}
