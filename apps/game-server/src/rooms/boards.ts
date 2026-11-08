import {
  WHITEBOARD_MAX_BYTES,
  WHITEBOARD_MAX_ELEMENTS,
  isNewerElement,
  jsonSize,
  sanitizeBoardElement,
  type BoardElement,
} from '@pixels/shared';

export interface ApplyResult {
  /** Cambios que se han quedado: hay que enviarlos a los demás. */
  accepted: BoardElement[];
  /** Lo que el remitente tenía viejo: se le devuelve la versión buena. */
  stale: BoardElement[];
  /** Algún cambio no cupo (demasiados elementos o demasiado grande). */
  full: boolean;
}

/** Contenido de una pizarra en memoria, con los límites de tamaño. */
export class BoardDocument {
  private elements = new Map<string, { el: BoardElement; bytes: number }>();
  private bytes = 0;
  /** Sesiones que la tienen abierta. */
  readonly viewers = new Set<string>();
  /** Hay cambios sin guardar. */
  dirty = false;
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Guardados en curso, en orden (nunca dos a la vez). */
  saving: Promise<void> = Promise.resolve();

  /**
   * Al cargar se descartan los elementos borrados: la pizarra no estaba abierta, así que nadie los
   * necesita para sincronizar (y no ocupan sitio para siempre).
   */
  constructor(saved: unknown[]) {
    for (const raw of saved) {
      const el = sanitizeBoardElement(raw);
      if (el && !el.isDeleted) this.apply([el]);
    }
    this.dirty = false;
  }

  get size() {
    return { elements: this.elements.size, bytes: this.bytes };
  }

  list(): BoardElement[] {
    return [...this.elements.values()].map((e) => e.el);
  }

  apply(incoming: BoardElement[]): ApplyResult {
    const result: ApplyResult = { accepted: [], stale: [], full: false };
    for (const el of incoming) {
      const existing = this.elements.get(el.id);
      if (!isNewerElement(el, existing?.el)) {
        if (existing && existing.el.version !== el.version) result.stale.push(existing.el);
        continue;
      }
      const bytes = jsonSize(el);
      const count = this.elements.size + (existing ? 0 : 1);
      const total = this.bytes - (existing?.bytes ?? 0) + bytes;
      // Lo que no hace crecer la pizarra (borrar, encoger) siempre se acepta.
      const grows = count > this.elements.size || total > this.bytes;
      if (grows && (count > WHITEBOARD_MAX_ELEMENTS || total > WHITEBOARD_MAX_BYTES)) {
        result.full = true;
        continue;
      }
      this.elements.set(el.id, { el, bytes });
      this.bytes = total;
      result.accepted.push(el);
    }
    if (result.accepted.length > 0) this.dirty = true;
    return result;
  }
}
