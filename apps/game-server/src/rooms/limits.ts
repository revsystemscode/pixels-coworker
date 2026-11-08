import {
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  MOVE_DURATION_MS,
  STEP_BURST,
  STEP_SPEED_TOLERANCE,
} from '@pixels/shared';

/** Limita la velocidad de movimiento con un cubo de créditos (token bucket). */
export class StepLimiter {
  private credits = STEP_BURST;
  private last: number;

  constructor(now: number) {
    this.last = now;
  }

  tryConsume(now: number): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.credits = Math.min(
      STEP_BURST,
      this.credits + (elapsed / MOVE_DURATION_MS) * STEP_SPEED_TOLERANCE,
    );
    if (this.credits < 1) return false;
    this.credits -= 1;
    return true;
  }
}

/** Limita los mensajes de chat a CHAT_RATE_LIMIT por ventana de CHAT_RATE_WINDOW_MS. */
export class ChatLimiter {
  private sent: number[] = [];

  tryConsume(now: number): boolean {
    this.sent = this.sent.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (this.sent.length >= CHAT_RATE_LIMIT) return false;
    this.sent.push(now);
    return true;
  }
}

/** Cubo de créditos genérico: `ratePerSecond` de media y ráfagas de hasta `burst`. */
export class TokenBucket {
  private credits: number;
  private last: number | null = null;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
  ) {
    this.credits = burst;
  }

  tryConsume(now: number): boolean {
    if (this.last !== null) {
      const elapsed = Math.max(0, now - this.last);
      this.credits = Math.min(this.burst, this.credits + (elapsed / 1000) * this.ratePerSecond);
    }
    this.last = now;
    if (this.credits < 1) return false;
    this.credits -= 1;
    return true;
  }
}
