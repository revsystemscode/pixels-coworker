import * as Sentry from '@sentry/node';

/**
 * Errores a Sentry (solo si hay SENTRY_DSN). Se importa lo primero del proceso.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Nada de datos personales ni secretos: ni usuario, ni cookies, ni cabeceras, ni cuerpos, ni la
    // query de las URLs (los enlaces de login llevan su token ahí).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  });
}

export const sentryEnabled = !!dsn;

/** Avisa de un error inesperado: a la consola siempre y a Sentry si está activo. */
export function reportError(message: string, err: unknown) {
  console.error(message, err);
  if (sentryEnabled) Sentry.captureException(err, { extra: { message } });
}
