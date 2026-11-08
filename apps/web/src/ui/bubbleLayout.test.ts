import { describe, expect, it } from 'vitest';
import { layoutBubbles, type BubbleBox } from './bubbleLayout.js';

const opts = {
  width: 100,
  height: 75,
  gap: 8,
  viewport: { width: 1000, height: 800 },
  margin: 8,
};

const overlap = (a: BubbleBox, b: BubbleBox) =>
  a.left < b.left + opts.width &&
  b.left < a.left + opts.width &&
  a.top < b.top + opts.height &&
  b.top < a.top + opts.height;

describe('layoutBubbles', () => {
  it('pone la burbuja encima del avatar, centrada', () => {
    expect(layoutBubbles([{ id: 'a', x: 500, y: 400 }], opts)).toEqual([
      { id: 'a', left: 450, top: 325 },
    ]);
  });

  it('separa las burbujas de avatares pegados y mantiene el centro del grupo', () => {
    const boxes = layoutBubbles(
      [
        { id: 'a', x: 500, y: 400 },
        { id: 'b', x: 548, y: 400 },
        { id: 'c', x: 524, y: 410 },
      ],
      opts,
    );
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(overlap(a, b)).toBe(false);
    const center = boxes.reduce((s, b) => s + b.left + opts.width / 2, 0) / boxes.length;
    expect(center).toBeCloseTo(524, -1);
  });

  it('no se sale de la pantalla', () => {
    const [box] = layoutBubbles([{ id: 'a', x: 5, y: 20 }], opts);
    expect(box).toEqual({ id: 'a', left: 8, top: 8 });
  });

  it('deja en su sitio las burbujas que no se tocan', () => {
    const boxes = layoutBubbles(
      [
        { id: 'a', x: 200, y: 400 },
        { id: 'b', x: 700, y: 400 },
      ],
      opts,
    );
    expect(boxes.map((b) => b.left)).toEqual([150, 650]);
  });
});
