import { describe, expect, it } from 'vitest';
import { parseWorldMap } from '@pixels/shared';
import { tiledFromAscii } from '@pixels/shared/testing';
import { Predictor } from './prediction.js';

const map = parseWorldMap(
  tiledFromAscii([
    '######', //
    '#S...#',
    '######',
  ]),
);

describe('Predictor', () => {
  it('mueve al instante y numera los pasos', () => {
    const p = new Predictor(map, { x: 1, y: 1, seq: 0 });
    expect(p.step('right')).toEqual({ seq: 1, next: { x: 2, y: 1 } });
    expect(p.step('right')).toEqual({ seq: 2, next: { x: 3, y: 1 } });
    expect(p.position).toEqual({ x: 3, y: 1 });
  });

  it('no atraviesa paredes, pero el paso cuenta igual (para girar)', () => {
    const p = new Predictor(map, { x: 1, y: 1, seq: 0 });
    expect(p.step('up')).toEqual({ seq: 1, next: null });
    expect(p.position).toEqual({ x: 1, y: 1 });
  });

  it('no corrige nada si el servidor confirma lo predicho', () => {
    const p = new Predictor(map, { x: 1, y: 1, seq: 0 });
    p.step('right');
    p.step('right');
    // El servidor solo ha procesado el primer paso: el segundo sigue pendiente.
    expect(p.reconcile({ x: 2, y: 1, seq: 1 })).toBeNull();
    expect(p.pendingCount).toBe(1);
    expect(p.reconcile({ x: 3, y: 1, seq: 2 })).toBeNull();
    expect(p.pendingCount).toBe(0);
  });

  it('corrige la posición si el servidor rechazó un paso', () => {
    const p = new Predictor(map, { x: 1, y: 1, seq: 0 });
    p.step('right'); // el servidor lo rechaza (por ejemplo, por ir demasiado rápido)
    p.step('right');
    // seq 1 procesado sin mover: con el paso 2 pendiente, la posición correcta es x=2.
    expect(p.reconcile({ x: 1, y: 1, seq: 1 })).toEqual({ x: 2, y: 1 });
    expect(p.position).toEqual({ x: 2, y: 1 });
  });

  it('sigue numerando a partir de la secuencia del servidor', () => {
    const p = new Predictor(map, { x: 1, y: 1, seq: 41 });
    expect(p.step('right').seq).toBe(42);
  });
});
