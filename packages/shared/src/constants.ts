/** Tamaño de un tile en píxeles (los packs de Kenney usan 16 px). Los mapas de Tiled deben usar este valor. */
export const TILE_SIZE = 16;

/** Nombre de la sala de Colyseus que representa un espacio. */
export const WORLD_ROOM = 'world';

/** Máximo de jugadores por sala en el MVP. */
export const MAX_PLAYERS_PER_ROOM = 25;

/** Veces por segundo que el servidor envía el estado (rango objetivo: 10–20). */
export const SERVER_TICK_RATE = 15;

/** Tiempo que tarda un avatar en avanzar un tile. */
export const MOVE_DURATION_MS = 160;

/**
 * Control de velocidad en el servidor: cada jugador gana 1 "crédito" de paso cada MOVE_DURATION_MS
 * (con un margen de STEP_SPEED_TOLERANCE) y puede acumular hasta STEP_BURST. Así se toleran pasos
 * que llegan juntos por la variación de la red, pero nadie se mueve más rápido de lo permitido.
 */
export const STEP_BURST = 3;
export const STEP_SPEED_TOLERANCE = 1.15;

/** Número de avatares disponibles (personajes del pack RPG Urban de Kenney). */
export const AVATAR_COUNT = 6;

export const NAME_MAX_LENGTH = 24;
export const CHAT_MAX_LENGTH = 280;

/** Límite de mensajes de chat por jugador: CHAT_RATE_LIMIT mensajes cada CHAT_RATE_WINDOW_MS. */
export const CHAT_RATE_LIMIT = 5;
export const CHAT_RATE_WINDOW_MS = 5000;

/** Mensajes de chat que guarda el servidor para quien entra tarde. */
export const CHAT_HISTORY_SIZE = 50;

/** Proximidad: se oye y se ve a quien está a HEARING_RADIUS tiles o menos (distancia euclídea). */
export const HEARING_RADIUS = 3;
/** Volumen al borde del radio. Hasta 1 tile de distancia el volumen es 1. */
export const MIN_HEARING_VOLUME = 0.3;
