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
