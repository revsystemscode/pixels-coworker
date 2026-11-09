/**
 * Direcciones de la API y del servidor de juego. En desarrollo son absolutas (otros puertos); en
 * producción pueden ser relativas al dominio de la web (`/api`, `/game`), así la misma compilación
 * vale para cualquier dominio.
 */
const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
const absolute = (url: string) => new URL(url || '/', origin).toString().replace(/\/$/, '');

const apiUrl = absolute(import.meta.env.VITE_API_URL ?? 'http://localhost:3001');
const gameServerUrl = absolute(import.meta.env.VITE_GAME_SERVER_URL ?? 'http://localhost:2567');

export const env = {
  apiUrl,
  /**
   * Donde vive el login (Better Auth añade /api/auth). En desarrollo es la API; en producción, el
   * propio dominio (VITE_AUTH_URL vacía), porque /api/auth se pasa a la API sin quitar el prefijo.
   */
  authUrl:
    import.meta.env.VITE_AUTH_URL === undefined ? apiUrl : absolute(import.meta.env.VITE_AUTH_URL),
  gameServerUrl,
  /** Colyseus usa WebSocket: misma URL con ws:// o wss://. */
  gameServerWsUrl: gameServerUrl.replace(/^http/, 'ws'),
};
