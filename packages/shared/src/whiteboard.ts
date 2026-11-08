import { WHITEBOARD_MAX_ELEMENT_BYTES, WHITEBOARD_MAX_ELEMENTS } from './constants.js';

/**
 * Pizarra colaborativa (Excalidraw). La sala del espacio guarda los elementos de cada pizarra y
 * reparte los cambios entre quienes la tienen abierta.
 *
 * Cada elemento lleva `version` (sube con cada cambio) y `versionNonce` (aleatorio). Si dos
 * personas cambian el mismo elemento, gana la versión más alta y, si empatan, el `versionNonce` más
 * bajo: la misma regla que `reconcileElements` de Excalidraw, así servidor y clientes coinciden.
 * Los borrados son elementos con `isDeleted: true` (así el borrado también se propaga).
 */

/** Elemento de Excalidraw. Solo se validan los campos que usa el servidor; el resto viaja tal cual. */
export interface BoardElement {
  id: string;
  type: BoardElementType;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  [key: string]: unknown;
}

/**
 * Tipos permitidos. Sin imágenes (necesitan un almacén de archivos) ni contenido incrustado
 * (iframes de otras webs).
 */
export const BOARD_ELEMENT_TYPES = [
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
  'frame',
] as const;
export type BoardElementType = (typeof BOARD_ELEMENT_TYPES)[number];

/** Herramienta del puntero que se ve en las pizarras de los demás. */
export type BoardPointerTool = 'pointer' | 'laser';

// --- Mensajes (cliente → servidor) ---

export interface BoardOpenMessage {
  boardId: string;
}

export interface BoardUpdateMessage {
  boardId: string;
  elements: BoardElement[];
}

export interface BoardPointerMessage {
  boardId: string;
  x: number;
  y: number;
  tool: BoardPointerTool;
  /** 'down' mientras se arrastra (Excalidraw lo dibuja distinto). */
  button: 'up' | 'down';
}

// --- Mensajes (servidor → cliente) ---

/** Contenido completo al abrir (o para volver a sincronizar). */
export interface BoardSceneMessage {
  boardId: string;
  elements: BoardElement[];
}

/** El puntero de otra persona. */
export interface BoardRemotePointerMessage extends BoardPointerMessage {
  sessionId: string;
}

export interface BoardViewer {
  sessionId: string;
  name: string;
  avatar: number;
}

/** Quién tiene abierta la pizarra (se envía cuando cambia). */
export interface BoardViewersMessage {
  boardId: string;
  viewers: BoardViewer[];
}

export interface BoardErrorMessage {
  boardId: string;
  message: string;
  /** true si la pizarra se ha cerrado (por ejemplo, porque estás lejos). */
  closed: boolean;
}

// --- Validación (nunca confiar en el cliente) ---

const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ELEMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Coordenadas razonables: evita números enormes que rompan el dibujo de los demás. */
const MAX_COORD = 1e7;
const MAX_DEPTH = 6;
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const isFiniteCoord = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;

export function isBoardId(raw: unknown): raw is string {
  return typeof raw === 'string' && BOARD_ID.test(raw);
}

/** Solo datos JSON simples (sin binarios, NaN, prototipos raros ni anidación profunda). */
function isPlainJson(value: unknown, depth: number): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= MAX_DEPTH || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.every((v) => isPlainJson(v, depth + 1));
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.entries(value).every(
    ([key, v]) => key !== '__proto__' && isPlainJson(v, depth + 1),
  );
}

/** Tamaño aproximado en bytes (longitud del JSON). */
export function jsonSize(value: unknown): number {
  return JSON.stringify(value).length;
}

/**
 * Devuelve una copia limpia del elemento, o null si no es válido. Los enlaces que no son http(s)
 * ni mailto se quitan (un `javascript:` se ejecutaría al hacer clic en la pizarra de otra persona).
 */
export function sanitizeBoardElement(raw: unknown): BoardElement | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const el = raw as Record<string, unknown>;
  if (typeof el.id !== 'string' || !ELEMENT_ID.test(el.id)) return null;
  if (!(BOARD_ELEMENT_TYPES as readonly unknown[]).includes(el.type)) return null;
  if (!Number.isSafeInteger(el.version) || (el.version as number) < 1) return null;
  if (!Number.isSafeInteger(el.versionNonce)) return null;
  if (typeof el.isDeleted !== 'boolean') return null;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!isFiniteCoord(el[key])) return null;
  }
  if (!isPlainJson(el, 0)) return null;

  const clean = JSON.parse(JSON.stringify(el)) as BoardElement;
  if (clean.link != null && (typeof clean.link !== 'string' || !SAFE_LINK.test(clean.link))) {
    clean.link = null;
  }
  return jsonSize(clean) <= WHITEBOARD_MAX_ELEMENT_BYTES ? clean : null;
}

/** true si `incoming` debe reemplazar a `existing` (misma regla que Excalidraw). */
export function isNewerElement(incoming: BoardElement, existing: BoardElement | undefined) {
  return (
    !existing ||
    incoming.version > existing.version ||
    (incoming.version === existing.version && incoming.versionNonce < existing.versionNonce)
  );
}

export function parseBoardOpen(raw: unknown): BoardOpenMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { boardId } = raw as Record<string, unknown>;
  return isBoardId(boardId) ? { boardId } : null;
}

/**
 * Mensaje de cambios. Los elementos no válidos se descartan uno a uno (el resto se aplica).
 * Devuelve null si el mensaje entero no tiene sentido.
 */
export function parseBoardUpdate(raw: unknown): BoardUpdateMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { boardId, elements } = raw as Record<string, unknown>;
  if (!isBoardId(boardId) || !Array.isArray(elements)) return null;
  if (elements.length === 0 || elements.length > WHITEBOARD_MAX_ELEMENTS) return null;
  const valid = elements.map(sanitizeBoardElement).filter((e): e is BoardElement => e !== null);
  return { boardId, elements: valid };
}

export function parseBoardPointer(raw: unknown): BoardPointerMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { boardId, x, y, tool, button } = raw as Record<string, unknown>;
  if (!isBoardId(boardId) || !isFiniteCoord(x) || !isFiniteCoord(y)) return null;
  if (tool !== 'pointer' && tool !== 'laser') return null;
  if (button !== 'up' && button !== 'down') return null;
  return { boardId, x, y, tool, button };
}

/**
 * Parte una lista de elementos en trozos de como mucho `maxBytes` (para no superar el tamaño
 * máximo de un mensaje). Un elemento más grande que `maxBytes` va solo en su trozo.
 */
export function chunkElements<T>(elements: readonly T[], maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const el of elements) {
    const s = jsonSize(el) + 1;
    if (current.length > 0 && size + s > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(el);
    size += s;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
