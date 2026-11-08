import type { FastifyInstance } from 'fastify';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import type { MediaTokenResponse } from '@pixels/shared';
import { verifyMediaTicket } from '@pixels/shared/tickets';

export interface MediaOptions {
  /** URL de LiveKit que se entrega al navegador. */
  livekitPublicUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Secreto compartido con el servidor de juego. */
  ticketSecret: string;
  now?: () => number;
}

/** Vida del token de LiveKit. Mientras la conexión siga abierta, LiveKit lo renueva solo. */
const TOKEN_TTL = '1h';

/**
 * POST /media/token { ticket } → { url, token }
 * Canjea un ticket del servidor de juego por un token de LiveKit con la identidad del jugador.
 * Las claves de LiveKit solo existen aquí.
 */
export function registerMediaRoutes(app: FastifyInstance, options: MediaOptions) {
  const now = options.now ?? Date.now;

  app.post(
    '/media/token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ticket'],
          properties: { ticket: { type: 'string', maxLength: 2048 } },
        },
      },
    },
    async (req, reply) => {
      const { ticket } = req.body as { ticket: string };
      const payload = verifyMediaTicket(ticket, options.ticketSecret, now());
      if (!payload) return reply.code(401).send({ error: 'Ticket no válido o caducado' });

      const token = new AccessToken(options.livekitApiKey, options.livekitApiSecret, {
        identity: payload.sid,
        name: payload.name,
        ttl: TOKEN_TTL,
      });
      token.addGrant({
        room: payload.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canUpdateOwnMetadata: false,
        canPublishSources: [
          TrackSource.CAMERA,
          TrackSource.MICROPHONE,
          TrackSource.SCREEN_SHARE,
          TrackSource.SCREEN_SHARE_AUDIO,
        ],
      });

      const body: MediaTokenResponse = {
        url: options.livekitPublicUrl,
        token: await token.toJwt(),
      };
      return body;
    },
  );
}
