export interface BubbleAnchor {
  id: string;
  /** Punto sobre la cabeza del avatar (px). La burbuja se apoya encima, centrada. */
  x: number;
  y: number;
}

export interface BubbleBox {
  id: string;
  /** Esquina superior izquierda (px). */
  left: number;
  top: number;
}

export interface BubbleLayoutOptions {
  width: number;
  height: number;
  gap: number;
  /** Tamaño de la zona visible, para no salirse por los bordes. */
  viewport: { width: number; height: number };
  margin: number;
}

/**
 * Coloca las burbujas encima de cada avatar sin que se solapen. Las que quedarían montadas en
 * la misma franja se reparten en fila, manteniendo el centro del grupo, y nada se sale de la
 * pantalla.
 */
export function layoutBubbles(anchors: BubbleAnchor[], o: BubbleLayoutOptions): BubbleBox[] {
  const boxes = anchors
    .map((a) => ({ id: a.id, left: a.x - o.width / 2, top: a.y - o.height }))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  // Agrupa en filas las burbujas cuya altura se solapa.
  const rows: (typeof boxes)[] = [];
  for (const box of boxes) {
    const row = rows.find((r) => Math.abs(r[0]!.top - box.top) < o.height + o.gap);
    if (row) row.push(box);
    else rows.push([box]);
  }

  for (const row of rows) {
    row.sort((a, b) => a.left - b.left);
    const top = Math.min(...row.map((b) => b.top));
    const desiredCenter = row.reduce((sum, b) => sum + b.left, 0) / row.length;
    // Empuja hacia la derecha lo que se solapa y luego recentra el grupo.
    for (let i = 1; i < row.length; i++) {
      const min = row[i - 1]!.left + o.width + o.gap;
      if (row[i]!.left < min) row[i]!.left = min;
    }
    const center = row.reduce((sum, b) => sum + b.left, 0) / row.length;
    const shift = desiredCenter - center;
    for (const b of row) {
      b.left += shift;
      b.top = top;
    }
  }

  const maxLeft = o.viewport.width - o.width - o.margin;
  const maxTop = o.viewport.height - o.height - o.margin;
  for (const b of boxes) {
    b.left = Math.round(Math.max(o.margin, Math.min(maxLeft, b.left)));
    b.top = Math.round(Math.max(o.margin, Math.min(maxTop, b.top)));
  }
  return boxes;
}
