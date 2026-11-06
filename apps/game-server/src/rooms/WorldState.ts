import { schema, t, type SchemaType } from '@colyseus/schema';

// Estado mínimo de la Fase 0. En la Fase 1 se añaden dirección, avatar y movimiento.
export const Player = schema(
  {
    name: t.string(),
    x: t.number(),
    y: t.number(),
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
