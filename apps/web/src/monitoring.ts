import * as Sentry from '@sentry/react';
import { env } from './env.js';

/**
 * Errores de la web a Sentry. Los informes pasan por la API (POST /api/monitoring): mismo dominio, así
 * la CSP no se abre a terceros. Sin datos personales ni la query de las URLs (enlaces de login).
 */
export function startMonitoring(dsn: string) {
  Sentry.init({
    dsn,
    tunnel: `${env.apiUrl}/monitoring`,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  });
}
