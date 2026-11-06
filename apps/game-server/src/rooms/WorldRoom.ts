import { Room, type Client } from '@colyseus/core';
import {
  CHAT_HISTORY_SIZE,
  ClientMessage,
  DEFAULT_MAP,
  MAPS,
  SERVER_TICK_RATE,
  ServerMessage,
  applyStep,
  parseStep,
  parseWorldMap,
  sanitizeAvatar,
  sanitizeChat,
  sanitizeName,
  type ChatEntry,
  type WorldMap,
} from '@pixels/shared';
import { config } from '../config.js';
import { ChatLimiter, StepLimiter } from './limits.js';
import { Player, WorldState } from './WorldState.js';

interface ClientLimits {
  steps: StepLimiter;
  chat: ChatLimiter;
}

const defaultMap = parseWorldMap(MAPS[DEFAULT_MAP]);

export class WorldRoom extends Room<{ state: WorldState }> {
  override maxClients = config.roomMaxClients;
  override patchRate = 1000 / SERVER_TICK_RATE;
  // Protección extra: Colyseus desconecta a quien envíe más de esto por segundo.
  override maxMessagesPerSecond = 40;
  override state = new WorldState();

  // Ojo: las opciones de onCreate/onJoin vienen del cliente, así que el mapa y el reloj NO se
  // leen de ahí. Las pruebas los sustituyen con una subclase.
  protected map: WorldMap = defaultMap;
  protected now: () => number = Date.now;
  private limits = new Map<string, ClientLimits>();
  private chatHistory: ChatEntry[] = [];
  private chatCounter = 0;

  override onCreate() {
    this.onMessage(ClientMessage.Step, (client, raw) => this.handleStep(client, raw));
    this.onMessage(ClientMessage.Chat, (client, raw) => this.handleChat(client, raw));
  }

  override onJoin(client: Client, options?: { name?: unknown; avatar?: unknown }) {
    const { spawn } = this.map;
    this.state.players.set(
      client.sessionId,
      new Player({
        name: sanitizeName(options?.name),
        avatar: sanitizeAvatar(options?.avatar),
        x: spawn.x,
        y: spawn.y,
        seq: 0,
      }),
    );
    this.limits.set(client.sessionId, {
      steps: new StepLimiter(this.now()),
      chat: new ChatLimiter(),
    });
    client.send(ServerMessage.ChatHistory, this.chatHistory);
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
  }

  private handleStep(client: Client, raw: unknown) {
    const step = parseStep(raw);
    const player = this.state.players.get(client.sessionId);
    const limits = this.limits.get(client.sessionId);
    if (!step || !player || !limits || step.seq <= player.seq) return;

    player.seq = step.seq;
    player.dir = step.dir;
    if (!limits.steps.tryConsume(this.now())) return;

    const next = applyStep(this.map, player, step.dir);
    if (next) {
      player.x = next.x;
      player.y = next.y;
    }
  }

  private handleChat(client: Client, raw: unknown) {
    const text = sanitizeChat(raw);
    const player = this.state.players.get(client.sessionId);
    const limits = this.limits.get(client.sessionId);
    if (!text || !player || !limits || !limits.chat.tryConsume(this.now())) return;

    const entry: ChatEntry = {
      id: `${this.roomId}-${++this.chatCounter}`,
      sessionId: client.sessionId,
      name: player.name,
      text,
      at: this.now(),
    };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > CHAT_HISTORY_SIZE) this.chatHistory.shift();
    this.broadcast(ServerMessage.Chat, entry);
  }
}
