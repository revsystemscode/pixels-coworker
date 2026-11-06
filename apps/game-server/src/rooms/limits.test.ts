import { describe, expect, it } from 'vitest';
import { CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS, MOVE_DURATION_MS, STEP_BURST } from '@pixels/shared';
import { ChatLimiter, StepLimiter } from './limits.js';

describe('StepLimiter', () => {
  it('permite una ráfaga corta y luego frena', () => {
    const limiter = new StepLimiter(0);
    for (let i = 0; i < STEP_BURST; i++) expect(limiter.tryConsume(0)).toBe(true);
    expect(limiter.tryConsume(0)).toBe(false);
  });

  it('permite caminar sin parar a la velocidad normal', () => {
    const limiter = new StepLimiter(0);
    for (let i = 1; i <= 100; i++) expect(limiter.tryConsume(i * MOVE_DURATION_MS)).toBe(true);
  });

  it('tolera pasos que llegan juntos por la red', () => {
    const limiter = new StepLimiter(0);
    // Ritmo normal, pero los mensajes llegan en parejas.
    const arrivals = [160, 170, 480, 490, 800, 810, 1120, 1130];
    expect(arrivals.map((t) => limiter.tryConsume(t)).every(Boolean)).toBe(true);
  });

  it('impide moverse el doble de rápido de forma sostenida', () => {
    const limiter = new StepLimiter(0);
    let accepted = 0;
    for (let i = 1; i <= 100; i++) if (limiter.tryConsume(i * (MOVE_DURATION_MS / 2))) accepted++;
    expect(accepted).toBeLessThan(65);
  });
});

describe('ChatLimiter', () => {
  it('bloquea al superar el límite y se recupera tras la ventana', () => {
    const limiter = new ChatLimiter();
    for (let i = 0; i < CHAT_RATE_LIMIT; i++) expect(limiter.tryConsume(i)).toBe(true);
    expect(limiter.tryConsume(100)).toBe(false);
    expect(limiter.tryConsume(CHAT_RATE_WINDOW_MS + 10)).toBe(true);
  });
});
