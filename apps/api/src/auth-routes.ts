import type { FastifyInstance } from 'fastify';
import type { AuthOptionsResponse } from '@pixels/shared';
import type { Auth } from './auth.js';
import { toWebHeaders } from './session.js';

/**
 * Monta Better Auth en /api/auth/* (login con Google, enlace mágico, sesión y cierre de sesión).
 * Fastify le pasa la petición tal cual (cuerpo sin procesar) y devuelve su respuesta.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  auth: Auth,
  options: { baseURL: string; google: boolean },
) {
  app.get('/auth/options', async (): Promise<AuthOptionsResponse> => ({ google: options.google }));

  void app.register(async (scope) => {
    // Better Auth lee el cuerpo él mismo: aquí no se interpreta.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    scope.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      handler: async (req, reply) => {
        const headers = toWebHeaders(req.headers);
        // La IP la decide Fastify (no se confía en la cabecera que mande el cliente).
        headers.set('x-forwarded-for', req.ip);
        // La URL se construye con el origen configurado, nunca con la cabecera Host.
        const url = new URL(req.url, options.baseURL);
        const body = req.body instanceof Buffer && req.body.length ? req.body : undefined;
        const response = await auth.handler(
          new Request(url, { method: req.method, headers, ...(body ? { body } : {}) }),
        );

        reply.status(response.status);
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
      },
    });
  });
}
