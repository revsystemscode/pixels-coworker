import { schema, t, type SchemaType } from '@colyseus/schema';
import type { Direction } from '@pixels/shared';

export const Player = schema(
  {
    name: t.string(),
    avatar: t.uint8(),
    /** Posición en tiles. */
    x: t.int16(),
    y: t.int16(),
    dir: t.string<Direction>().default('down'),
    /** Último paso procesado (aceptado o no). El cliente lo usa para reconciliar su predicción. */
    seq: t.uint32(),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;

export const WorldState = schema(
  {
    players: t.map(Player),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
