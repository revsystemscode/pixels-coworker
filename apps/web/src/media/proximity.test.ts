import { describe, expect, it } from 'vitest';
import { ProximityTracker, sameKeys } from './proximity.js';

describe('ProximityTracker', () => {
  it('devuelve a quien se oye con su volumen', () => {
    const t = new ProximityTracker(1000);
    expect([...t.update(new Map([['a', 0.5]]), 0)]).toEqual([['a', 0.5]]);
  });

  it('mantiene unos instantes, con volumen 0, a quien acaba de salir del radio', () => {
    const t = new ProximityTracker(1000);
    t.update(new Map([['a', 1]]), 0);
    expect([...t.update(new Map(), 500)]).toEqual([['a', 0]]);
    expect([...t.update(new Map(), 1000)]).toEqual([]);
  });

  it('si vuelve a tiempo, recupera el volumen y el margen empieza de nuevo', () => {
    const t = new ProximityTracker(1000);
    t.update(new Map([['a', 1]]), 0);
    t.update(new Map(), 900);
    expect([...t.update(new Map([['a', 0.8]]), 950)]).toEqual([['a', 0.8]]);
    expect([...t.update(new Map(), 1900)]).toEqual([['a', 0]]);
  });

  it('forget olvida a quien se fue de la sala', () => {
    const t = new ProximityTracker(1000);
    t.update(new Map([['a', 1]]), 0);
    t.forget('a');
    expect(t.update(new Map(), 10).size).toBe(0);
  });
});

describe('sameKeys', () => {
  it('compara solo las claves', () => {
    expect(sameKeys(new Map([['a', 1]]), new Map([['a', 0]]))).toBe(true);
    expect(sameKeys(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
    expect(sameKeys(new Map(), new Map([['b', 1]]))).toBe(false);
  });
});
