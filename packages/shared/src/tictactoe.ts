/**
 * Tres en raya en las mesas de juego del mapa (objetos `game`). El servidor de juego guarda la
 * partida en memoria y es quien valida cada jugada; los clientes solo la dibujan.
 */
export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export const MARKS: readonly Mark[] = ['X', 'O'];

/** Las 8 líneas ganadoras (índices 0–8, de izquierda a derecha y de arriba abajo). */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export type Outcome = { winner: Mark; line: readonly number[] } | { winner: 'draw' } | null;

/** Quién ha ganado (y con qué línea), empate si el tablero está lleno, o null si sigue. */
export function outcomeOf(board: readonly Cell[]): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark && mark === board[b] && mark === board[c]) return { winner: mark, line };
  }
  return board.every((cell) => cell !== null) ? { winner: 'draw' } : null;
}

export interface GameSeat {
  sessionId: string;
  name: string;
}

/** Estado de una mesa tal como lo ven los clientes. */
export interface GameStateMessage {
  objectId: string;
  board: Cell[];
  seats: Record<Mark, GameSeat | null>;
  /** A quién le toca (si la partida sigue). */
  turn: Mark;
  /** Resultado al terminar: la marca ganadora y su línea, o empate. */
  outcome: Outcome;
  /** Cuántas personas tienen la mesa abierta (jugando o mirando). */
  watching: number;
}

export interface GameErrorMessage {
  objectId: string;
  message: string;
  /** La mesa se ha cerrado para quien recibe el error (por ejemplo, se alejó). */
  closed: boolean;
}

/** Cliente → servidor. */
export interface GameOpenMessage {
  objectId: string;
}
export interface GameMoveMessage {
  cell: number;
}

const OBJECT_ID = /^obj-\d{1,9}$/;

export function parseGameOpen(raw: unknown): GameOpenMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { objectId } = raw as Record<string, unknown>;
  return typeof objectId === 'string' && OBJECT_ID.test(objectId) ? { objectId } : null;
}

export function parseGameMove(raw: unknown): GameMoveMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { cell } = raw as Record<string, unknown>;
  return Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < 9
    ? { cell: cell as number }
    : null;
}

/**
 * Una partida en una mesa. Dos asientos (X y O); empieza X en la primera partida y en cada revancha
 * empieza quien no empezó la anterior.
 */
export class TicTacToe {
  board: Cell[] = Array<Cell>(9).fill(null);
  seats: Record<Mark, GameSeat | null> = { X: null, O: null };
  turn: Mark = 'X';
  outcome: Outcome = null;
  private starter: Mark = 'X';

  markOf(sessionId: string): Mark | null {
    return MARKS.find((m) => this.seats[m]?.sessionId === sessionId) ?? null;
  }

  get started() {
    return this.board.some((cell) => cell !== null);
  }

  /** Se sienta en el asiento libre (X primero). Devuelve un error si no puede. */
  sit(seat: GameSeat): string | null {
    if (this.markOf(seat.sessionId)) return null;
    const free = MARKS.find((m) => !this.seats[m]);
    if (!free) return 'Ya hay dos personas jugando.';
    this.seats[free] = seat;
    return null;
  }

  /**
   * Se levanta. Si la partida estaba a medias, se empieza de cero (con un solo jugador no se puede
   * seguir). Devuelve true si estaba sentado.
   */
  stand(sessionId: string): boolean {
    const mark = this.markOf(sessionId);
    if (!mark) return false;
    this.seats[mark] = null;
    if (!this.outcome) this.clear(this.starter);
    return true;
  }

  play(sessionId: string, cell: number): string | null {
    const mark = this.markOf(sessionId);
    if (!mark) return 'Siéntate para jugar.';
    if (!this.seats.X || !this.seats.O) return 'Espera a que se siente otra persona.';
    if (this.outcome) return 'La partida ha terminado.';
    if (mark !== this.turn) return 'No es tu turno.';
    if (this.board[cell] !== null) return 'Esa casilla ya está ocupada.';
    this.board[cell] = mark;
    this.outcome = outcomeOf(this.board);
    if (!this.outcome) this.turn = mark === 'X' ? 'O' : 'X';
    return null;
  }

  /** Otra partida (solo al terminar la anterior y si quien la pide está jugando). */
  rematch(sessionId: string): string | null {
    if (!this.markOf(sessionId)) return 'Solo quien juega puede empezar otra partida.';
    if (!this.outcome) return 'La partida todavía no ha terminado.';
    this.clear(this.starter === 'X' ? 'O' : 'X');
    return null;
  }

  private clear(starter: Mark) {
    this.board = Array<Cell>(9).fill(null);
    this.outcome = null;
    this.starter = starter;
    this.turn = starter;
  }
}
