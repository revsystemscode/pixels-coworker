// Bots para pruebas de carga: entran a un espacio y pasean por el mapa.
//   pnpm --filter @pixels/game-server bots -- [cantidad] [segundos] [id del espacio]
// Sin id, usan el último espacio creado. Para más de 25 bots, arranca el servidor con
// ROOM_MAX_CLIENTS=60. Firman sus propios tickets con TICKET_SECRET (solo para desarrollo).
import { Client, type Room } from '@colyseus/sdk';
import { createDb } from '@pixels/db';
import {
  AVATAR_COUNT,
  ClientMessage,
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_COLORS,
  encodeAvatar,
  DIRECTIONS,
  JOIN_TICKET_TTL_MS,
  MOVE_DURATION_MS,
  ServerMessage,
  WORLD_ROOM,
  applyStep,
  parseWorldMap,
  type Direction,
  type Point,
  type TiledMap,
} from '@pixels/shared';
import { signJoinTicket } from '@pixels/shared/tickets';
import { config } from '../src/config.js';

const count = Number(process.argv[2] ?? 50);
const seconds = Number(process.argv[3] ?? 0); // 0 = hasta Ctrl+C
const endpoint = (process.env.VITE_GAME_SERVER_URL ?? 'http://localhost:2567').replace(
  /^http/,
  'ws',
);

const db = createDb(config.databaseUrl);
const space = await db.space.findFirst({
  where: process.argv[4] ? { id: process.argv[4] } : {},
  orderBy: { createdAt: 'desc' },
  include: { map: { select: { data: true } } },
});
await db.$disconnect();
if (!space) {
  console.error('No hay ningún espacio. Crea uno en la web (o pasa su id) y vuelve a probar.');
  process.exit(1);
}
const map = parseWorldMap(space.map.data as unknown as TiledMap);

const randomDir = (): Direction => DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]!;

interface Bot {
  room: Room;
  pos: Point;
  dir: Direction;
  seq: number;
  timer: NodeJS.Timeout;
}

function walk(bot: Bot) {
  // Sigue recto casi siempre; a veces gira o se para un momento.
  if (Math.random() < 0.15) bot.dir = randomDir();
  if (Math.random() < 0.05) return;
  const next = applyStep(map, bot.pos, bot.dir);
  if (!next) {
    bot.dir = randomDir();
    return;
  }
  bot.pos = next;
  bot.room.send(ClientMessage.Step, { dir: bot.dir, seq: ++bot.seq });
}

const bots: Bot[] = [];
const client = new Client(endpoint);
for (let i = 0; i < count; i++) {
  const ticket = signJoinTicket(
    {
      uid: `bot-${i + 1}`,
      space: space.id,
      name: `Bot ${i + 1}`,
      // Colores variados: cada aspecto distinto es una textura más en el navegador.
      avatar: encodeAvatar({
        base: i % AVATAR_COUNT,
        shirt: i % (SHIRT_COLORS.length + 1),
        hair: i % (HAIR_COLORS.length + 1),
        skin: i % (SKIN_COLORS.length + 1),
      }),
      role: 'guest',
      exp: Date.now() + JOIN_TICKET_TTL_MS,
    },
    config.ticketSecret,
  );
  const room = await client.joinOrCreate(WORLD_ROOM, { spaceId: space.id, ticket });
  // Los bots ignoran el chat.
  room.onMessage(ServerMessage.ChatHistory, () => {});
  room.onMessage(ServerMessage.Chat, () => {});
  const bot: Bot = { room, pos: { ...map.spawn }, dir: randomDir(), seq: 0, timer: undefined! };
  // Un poco más lento que el máximo para no chocar con el límite de velocidad.
  bot.timer = setInterval(() => walk(bot), MOVE_DURATION_MS + 20);
  bots.push(bot);
}
const rooms = new Set(bots.map((b) => b.room.roomId));
console.log(
  `${bots.length} bots en «${space.name}» (${endpoint}, salas: ${rooms.size}). Ctrl+C para parar.`,
);

async function stop() {
  for (const b of bots) clearInterval(b.timer);
  await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
  process.exit(0);
}
process.on('SIGINT', () => void stop());
if (seconds > 0) setTimeout(() => void stop(), seconds * 1000);
