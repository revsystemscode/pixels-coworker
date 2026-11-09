/** Tamaño de un tile en píxeles (los packs de Kenney usan 16 px). Los mapas de Tiled deben usar este valor. */
export const TILE_SIZE = 16;

/** Nombre de la sala de Colyseus que representa un espacio. */
export const WORLD_ROOM = 'world';

/** Máximo de jugadores por sala (un espacio = una sala). Probado con 100 bots: ver README. */
export const MAX_PLAYERS_PER_ROOM = 100;

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

/** Número de personajes base (del pack RPG Urban de Kenney). Los colores: ver avatar.ts. */
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

/** Vida del ticket de medios (servidor de juego → API). Solo sirve para pedir el token al entrar. */
export const MEDIA_TICKET_TTL_MS = 60_000;

/** Vida del ticket para entrar a la sala de un espacio (API → servidor de juego). */
export const JOIN_TICKET_TTL_MS = 60_000;

// --- Objetos del mapa ---

/** Pizarras y objetos se abren desde INTERACT_REACH casillas o menos (en cualquier dirección). */
export const INTERACT_REACH = 2;
/** Longitud máxima del texto de una nota y de una dirección web. */
export const NOTE_MAX_LENGTH = 2_000;
export const URL_MAX_LENGTH = 2_000;

// --- Pizarra ---

export const WHITEBOARD_REACH = INTERACT_REACH;
/** Máximo de elementos por pizarra (contando los borrados que aún se guardan). */
export const WHITEBOARD_MAX_ELEMENTS = 3000;
/** Tamaño máximo de una pizarra (JSON) y de un elemento (un trazo largo a mano ronda 50 KB). */
export const WHITEBOARD_MAX_BYTES = 2_000_000;
export const WHITEBOARD_MAX_ELEMENT_BYTES = 60_000;
/**
 * Tamaño (JSON) de cada trozo de cambios que envía el cliente: los más grandes se parten. Cabe con
 * margen en GAME_MAX_MESSAGE_BYTES aunque msgpack ocupe más que el JSON (números con decimales).
 */
export const WHITEBOARD_MAX_UPDATE_BYTES = 64_000;
/** Tamaño máximo de un mensaje del cliente al servidor de juego (por defecto Colyseus deja 4 KB). */
export const GAME_MAX_MESSAGE_BYTES = 256 * 1024;
/** Cada cuánto envía el cliente sus cambios y su puntero mientras dibuja. */
export const WHITEBOARD_SEND_INTERVAL_MS = 100;
/** Tras el último cambio, el servidor espera esto antes de guardar la pizarra. */
export const WHITEBOARD_SAVE_DELAY_MS = 2_000;
