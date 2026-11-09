import type { Room } from '@colyseus/sdk';
import type { MapObject } from '@pixels/shared';
import { useGame } from '../tictactoe/store.js';
import { useObjects } from './store.js';

/** Abre un objeto del mapa: la mesa de juego tiene su propio panel. */
export function openMapObject(room: Room, object: MapObject) {
  if (object.kind === 'game') {
    useGame.getState().openGame(room, object);
  } else {
    useGame.getState().close();
    useObjects.getState().openObject(object);
  }
}
