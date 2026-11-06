// Bots para pruebas de carga: entran a la sala y pasean por el mapa.
//   pnpm --filter @pixels/game-server bots -- [cantidad] [segundos]
// Para más de 25 bots, arranca el servidor con ROOM_MAX_CLIENTS=60.
import { Client, type Room } from '@colyseus/sdk';
import {
  AVATAR_COUNT,
  ClientMessage,
  DEFAULT_MAP,
  DIRECTIONS,
  MAPS,
  MOVE_DURATION_MS,
  ServerMessage,
  WORLD_ROOM,
  applyStep,
  parseWorldMap,
  type Direction,
  type Point,
} from '@pixels/shared';

const count = Number(process.argv[2] ?? 50);
const seconds = Number(process.argv[3] ?? 0); // 0 = hasta Ctrl+C
const endpoint = (process.env.VITE_GAME_SERVER_URL ?? 'http://localhost:2567').replace(
  /^http/,
  'ws',
);
const map = parseWorldMap(MAPS[DEFAULT_MAP]);

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
  const room = await client.joinOrCreate(WORLD_ROOM, {
    name: `Bot ${i + 1}`,
    avatar: i % AVATAR_COUNT,
  });
  // Los bots ignoran el chat.
  room.onMessage(ServerMessage.ChatHistory, () => {});
  room.onMessage(ServerMessage.Chat, () => {});
  const bot: Bot = { room, pos: { ...map.spawn }, dir: randomDir(), seq: 0, timer: undefined! };
  // Un poco más lento que el máximo para no chocar con el límite de velocidad.
  bot.timer = setInterval(() => walk(bot), MOVE_DURATION_MS + 20);
  bots.push(bot);
}
const rooms = new Set(bots.map((b) => b.room.roomId));
console.log(`${bots.length} bots conectados a ${endpoint} (salas: ${rooms.size})`);

async function stop() {
  for (const b of bots) clearInterval(b.timer);
  await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
  process.exit(0);
}
process.on('SIGINT', () => void stop());
if (seconds > 0) setTimeout(() => void stop(), seconds * 1000);
