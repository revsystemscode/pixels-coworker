import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Cada cuánto se reinicia la medida del bucle de eventos (se informa la ventana anterior). */
const WINDOW_MS = 30_000;

/**
 * Carga del proceso para /health: si el bucle de eventos se retrasa, la sala no llega a enviar el
 * estado a su ritmo (15 veces por segundo) y el movimiento se nota a saltos.
 */
export function createLoadMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let lastP99 = 0;
  const timer = setInterval(() => {
    lastP99 = histogram.percentile(99) / 1e6;
    histogram.reset();
  }, WINDOW_MS);
  timer.unref();

  return {
    snapshot() {
      // Mientras no ha pasado una ventana entera, vale lo medido hasta ahora.
      const current = histogram.count > 0 ? histogram.percentile(99) / 1e6 : 0;
      return {
        eventLoopP99Ms: Math.round(Math.max(lastP99, current) * 10) / 10,
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      };
    },
    stop() {
      clearInterval(timer);
      histogram.disable();
    },
  };
}
