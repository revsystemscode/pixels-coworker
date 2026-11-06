/** Tamaño de un tile en píxeles. Los mapas de Tiled deben usar este valor. */
export const TILE_SIZE = 32;

/** Nombre de la sala de Colyseus que representa un espacio. */
export const WORLD_ROOM = 'world';

/** Máximo de jugadores por sala en el MVP. */
export const MAX_PLAYERS_PER_ROOM = 25;

/** Veces por segundo que el servidor envía el estado (rango objetivo: 10–20). */
export const SERVER_TICK_RATE = 15;
