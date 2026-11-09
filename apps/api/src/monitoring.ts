import type { FastifyInstance } from 'fastify';

/** Tamaño máximo de un informe de error de la web. */
const ENVELOPE_LIMIT = 512 * 1024;

/**
 * Túnel de Sentry: la web envía sus informes de error a POST /monitoring (su propio dominio, así no
 * hace falta abrir la CSP ni los bloquean los bloqueadores de anuncios) y la API los reenvía a Sentry.
 * Solo acepta informes del proyecto configurado (SENTRY_DSN_WEB): no es un proxy abierto.
 */
export function registerMonitoringRoute(app: FastifyInstance, webDsn: string | null) {
  const target = webDsn ? parseDsn(webDsn) : null;

  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: ENVELOPE_LIMIT },
      (_r, b, done) => done(null, b),
    );
    scope.post(
      '/monitoring',
      { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
      async (req, reply) => {
        if (!target) return reply.code(404).send({ error: 'No configurado' });
        const body = req.body as Buffer;
        // La primera línea del sobre es JSON con el DSN de quien lo manda.
        const header = body.subarray(0, Math.max(0, body.indexOf(0x0a))).toString('utf8');
        let dsn: unknown;
        try {
          dsn = (JSON.parse(header) as { dsn?: unknown }).dsn;
        } catch {
          return reply.code(400).send({ error: 'Informe no válido' });
        }
        if (dsn !== webDsn) return reply.code(403).send({ error: 'Proyecto no permitido' });
        const res = await fetch(target.url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-sentry-envelope' },
          body,
          signal: AbortSignal.timeout(5_000),
        }).catch(() => null);
        return reply.code(res?.ok ? 200 : 502).send();
      },
    );
  });
}

/** https://<clave>@<host>/<proyecto> → URL de envío de sobres de ese proyecto. */
export function parseDsn(dsn: string): { url: string } | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\//, '');
    if (u.protocol !== 'https:' || !/^\d+$/.test(project)) return null;
    return { url: `https://${u.host}/api/${project}/envelope/` };
  } catch {
    return null;
  }
}
