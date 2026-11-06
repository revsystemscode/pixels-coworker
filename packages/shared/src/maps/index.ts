import type { TiledMap } from '../map.js';
import office from './office.json' with { type: 'json' };

/** Mapas incluidos en el repositorio, por clave. */
export const MAPS = {
  office: office as unknown as TiledMap,
};

export type MapKey = keyof typeof MAPS;
export const DEFAULT_MAP: MapKey = 'office';
