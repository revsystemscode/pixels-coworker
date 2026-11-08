import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink } from 'better-auth/plugins';
import type { Db } from '@pixels/db';
import { magicLinkMail, type Mailer } from './mail.js';

export const MAGIC_LINK_MINUTES = 15;

export interface AuthOptions {
  /** URL pública de la API (Better Auth vive en `${baseURL}/api/auth`). */
  baseURL: string;
  secret: string;
  /** Origen de la web: único destino permitido tras el login. */
  webOrigin: string;
  google: { clientId: string; clientSecret: string } | null;
  mailer: Mailer;
  /** Límite de peticiones de login por IP. Solo se apaga en las pruebas E2E. */
  rateLimit: boolean;
}

export function createAuth(db: Db, options: AuthOptions) {
  return betterAuth({
    appName: 'pixels-coworker',
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: [options.webOrigin],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    user: {
      additionalFields: {
        // Se cambia con PATCH /me (con validación), nunca al registrarse.
        avatar: { type: 'number', defaultValue: 0, input: false },
      },
    },
    account: {
      // Mismo correo con Google y con enlace mágico = misma cuenta (Google verifica el correo).
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    socialProviders: options.google ? { google: options.google } : {},
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_MINUTES * 60,
        storeToken: 'hashed',
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url }) => {
          await options.mailer(magicLinkMail(email, url, MAGIC_LINK_MINUTES));
        },
      }),
    ],
    rateLimit: { enabled: options.rateLimit, window: 60, max: 100 },
    advanced: {
      cookiePrefix: 'pixels',
      // Better Auth la apaga por defecto al correr en pruebas: así se prueba lo mismo que en producción.
      disableOriginCheck: false,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
