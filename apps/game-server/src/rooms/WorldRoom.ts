import { Room, ServerError, type Client } from '@colyseus/core';
import {
  CHAT_HISTORY_SIZE,
  ClientMessage,
  LeaveCode,
  MEDIA_TICKET_TTL_MS,
  SERVER_TICK_RATE,
  ServerMessage,
  WHITEBOARD_REACH,
  WHITEBOARD_SAVE_DELAY_MS,
  EDITABLE_KINDS,
  TicTacToe,
  applyStep,
  canEditObjects,
  distanceToRect,
  isWithinReach,
  nearestWalkable,
  parseGameMove,
  parseGameOpen,
  isWalkable,
  parseBoardOpen,
  parseBoardPointer,
  parseBoardUpdate,
  parseEmote,
  parseHand,
  parseObjectEdit,
  parseObjectValue,
  parseStep,
  parseWorldMap,
  sanitizeAvatar,
  sanitizeChat,
  sanitizeName,
  type BoardElement,
  type BoardErrorMessage,
  type BoardRemotePointerMessage,
  type BoardSceneMessage,
  type BoardUpdateMessage,
  type BoardViewersMessage,
  type ChatEntry,
  type GameErrorMessage,
  type GameStateMessage,
  type MediaTicketMessage,
  type ObjectContentMessage,
  type ObjectContentsMessage,
  type ObjectErrorMessage,
  type RemoteEmoteMessage,
  type Role,
  type RoleChangedMessage,
  type SpaceEvent,
  type WorldMap,
} from '@pixels/shared';
import { signMediaTicket, verifyJoinTicket, type JoinTicketPayload } from '@pixels/shared/tickets';
import type { SavedPosition, SpaceStore } from '../store.js';
import { BoardDocument } from './boards.js';
import { ChatLimiter, StepLimiter, TokenBucket } from './limits.js';
import { Player, WorldState } from './WorldState.js';

interface ClientLimits {
  steps: StepLimiter;
  chat: ChatLimiter;
  lastTicketAt: number;
  boardUpdates: TokenBucket;
  boardPointer: TokenBucket;
  emotes: TokenBucket;
  objectEdits: TokenBucket;
  games: TokenBucket;
}

/** Una mesa de juego: la partida y quién la tiene abierta (jugando o mirando). */
interface GameTable {
  game: TicTacToe;
  viewers: Set<string>;
}

/** Lo que la sala recibe del servidor (no del cliente). */
export interface WorldRoomDeps {
  store: SpaceStore;
  /** Secreto compartido con la API para los tickets. */
  ticketSecret: string;
  maxClients: number;
  now?: () => number;
  onError?: (message: string, err: unknown) => void;
}

/** Mínimo entre dos tickets de medios pedidos por el mismo jugador. */
const MEDIA_TICKET_COOLDOWN_MS = 5_000;
const SPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Salas abiertas en este proceso, por espacio (una por espacio). */
const roomsBySpace = new Map<string, WorldRoom>();

/** Saca de la sala a quien la API dice que ya no tiene acceso. */
export function handleSpaceEvent(event: SpaceEvent) {
  const room = roomsBySpace.get(event.spaceId);
  if (!room) return;
  if (event.type === 'space-deleted') room.closeDeleted();
  else if (event.type === 'map-updated') void room.reloadMap();
  else if (event.type === 'role-changed') room.changeRole(event.userId, event.role);
  else room.removeUser(event.userId);
}

/**
 * Sala de un espacio. Se crea con `{ spaceId }` y solo deja entrar con un ticket de la API
 * (POST /spaces/:id/join). Nombre y avatar salen del ticket, nunca de las opciones del cliente.
 */
export class WorldRoom extends Room<{ state: WorldState }> {
  override patchRate = 1000 / SERVER_TICK_RATE;
  // Protección extra: Colyseus desconecta a quien envíe más de esto por segundo.
  override maxMessagesPerSecond = 40;
  override state = new WorldState();

  /** Las da `createGameServer` con una subclase (Colyseus crea las salas sin argumentos). */
  protected deps!: WorldRoomDeps;
  protected map!: WorldMap;
  spaceId = '';
  private users = new Map<string, string>();
  /** Rol de cada sesión en el espacio (sale del ticket y lo actualiza la API). */
  private roles = new Map<string, Role>();
  /** Contenido actual de los objetos editables (enlaces, videos y notas), por id. */
  private objectValues = new Map<string, string>();
  /** Los guardados de objetos van en orden (el último en llegar es el que queda). */
  private objectSaves: Promise<void> = Promise.resolve();
  /** Mesas de juego con alguien (se crean al abrirlas). La partida no se guarda. */
  private games = new Map<string, GameTable>();
  /** Mesa abierta por cada sesión. */
  private openGames = new Map<string, string>();
  private limits = new Map<string, ClientLimits>();
  private chatHistory: ChatEntry[] = [];
  private chatCounter = 0;
  /** Pizarras cargadas (o cargándose), por id. */
  private boards = new Map<string, Promise<BoardDocument>>();
  /** Pizarra abierta por cada sesión. */
  private openBoards = new Map<string, string>();
  /** El espacio se ha borrado: ya no se guarda nada. */
  private deleted = false;

  protected now() {
    return (this.deps.now ?? Date.now)();
  }

  override async onCreate(options?: { spaceId?: unknown }) {
    this.maxClients = this.deps.maxClients;
    const spaceId = options?.spaceId;
    if (typeof spaceId !== 'string' || !SPACE_ID.test(spaceId)) {
      throw new ServerError(400, 'Espacio no válido');
    }
    // Una sala por espacio: si ya hay una, es que está llena.
    if (roomsBySpace.has(spaceId)) throw new ServerError(409, 'El espacio está lleno');
    roomsBySpace.set(spaceId, this);
    this.spaceId = spaceId;

    try {
      const tiled = await this.deps.store.loadMap(spaceId);
      if (!tiled) throw new ServerError(404, 'El espacio no existe');
      this.map = parseWorldMap(tiled);
      const saved = await this.deps.store.loadObjects(spaceId);
      for (const o of this.map.objects) {
        if (EDITABLE_KINDS.includes(o.kind)) this.objectValues.set(o.id, saved[o.id] ?? o.initial);
      }
    } catch (err) {
      roomsBySpace.delete(spaceId);
      throw err;
    }

    this.onMessage(ClientMessage.Step, (client, raw) => this.handleStep(client, raw));
    this.onMessage(ClientMessage.Chat, (client, raw) => this.handleChat(client, raw));
    this.onMessage(ClientMessage.MediaTicket, (client) => this.handleMediaTicket(client));
    this.onMessage(ClientMessage.Emote, (client, raw) => this.handleEmote(client, raw));
    this.onMessage(ClientMessage.Hand, (client, raw) => this.handleHand(client, raw));
    this.onMessage(ClientMessage.ObjectEdit, (client, raw) => this.handleObjectEdit(client, raw));
    this.onMessage(ClientMessage.GameOpen, (client, raw) => this.handleGameOpen(client, raw));
    this.onMessage(ClientMessage.GameClose, (client) => this.closeGame(client.sessionId));
    this.onMessage(ClientMessage.GameSit, (client) =>
      this.gameAction(client, (game, p) => game.sit({ sessionId: client.sessionId, name: p.name })),
    );
    this.onMessage(ClientMessage.GameStand, (client) =>
      this.gameAction(client, (game) => (game.stand(client.sessionId), null)),
    );
    this.onMessage(ClientMessage.GameMove, (client, raw) => {
      const move = parseGameMove(raw);
      if (move) this.gameAction(client, (game) => game.play(client.sessionId, move.cell));
    });
    this.onMessage(ClientMessage.GameRematch, (client) =>
      this.gameAction(client, (game) => game.rematch(client.sessionId)),
    );
    this.onMessage(ClientMessage.BoardOpen, (client, raw) => this.handleBoardOpen(client, raw));
    this.onMessage(ClientMessage.BoardClose, (client) => this.closeBoard(client.sessionId));
    this.onMessage(ClientMessage.BoardUpdate, (client, raw) => this.handleBoardUpdate(client, raw));
    this.onMessage(ClientMessage.BoardPointer, (client, raw) =>
      this.handleBoardPointer(client, raw),
    );
  }

  override onAuth(_client: Client, options?: { ticket?: unknown }): JoinTicketPayload {
    const ticket = verifyJoinTicket(options?.ticket, this.deps.ticketSecret, this.now());
    if (!ticket || ticket.space !== this.spaceId) {
      throw new ServerError(401, 'No tienes acceso a este espacio');
    }
    return ticket;
  }

  /** Sala de LiveKit asociada: una por sala de Colyseus. */
  get mediaRoom() {
    return `world-${this.roomId}`;
  }

  override async onJoin(client: Client) {
    const ticket = client.auth as JoinTicketPayload;

    // La misma cuenta en otra pestaña: se queda la nueva, en el sitio de la vieja.
    let position: SavedPosition | null = null;
    for (const other of this.clients) {
      if (other === client || this.users.get(other.sessionId) !== ticket.uid) continue;
      const old = this.state.players.get(other.sessionId);
      if (old) position = { x: old.x, y: old.y, dir: old.dir };
      this.forget(other.sessionId);
      other.leave(LeaveCode.Replaced);
    }
    position ??= await this.loadPosition(ticket.uid);
    const start = position && isWalkable(this.map, position.x, position.y) ? position : null;

    this.users.set(client.sessionId, ticket.uid);
    this.roles.set(client.sessionId, ticket.role);
    this.state.players.set(
      client.sessionId,
      new Player({
        name: sanitizeName(ticket.name),
        avatar: sanitizeAvatar(ticket.avatar),
        x: start?.x ?? this.map.spawn.x,
        y: start?.y ?? this.map.spawn.y,
        dir: start?.dir ?? 'down',
        seq: 0,
      }),
    );
    this.limits.set(client.sessionId, {
      steps: new StepLimiter(this.now()),
      chat: new ChatLimiter(),
      lastTicketAt: this.now(),
      // Holgado: un pegado grande llega en varios trozos seguidos.
      boardUpdates: new TokenBucket(20, 40),
      boardPointer: new TokenBucket(15, 15),
      // Reacciones y mano: unas cuantas seguidas, pero no una lluvia.
      emotes: new TokenBucket(1, 4),
      objectEdits: new TokenBucket(0.5, 3),
      games: new TokenBucket(5, 10),
    });
    client.send(ServerMessage.ChatHistory, this.chatHistory);
    client.send(ServerMessage.ObjectContents, {
      contents: Object.fromEntries(this.objectValues),
    } satisfies ObjectContentsMessage);
    this.sendMediaTicket(client);
  }

  override async onLeave(client: Client) {
    const uid = this.users.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    // Si lo reemplazó otra pestaña, ya no está aquí y la posición sigue en la sesión nueva.
    if (!uid || !player) return;
    const position: SavedPosition = { x: player.x, y: player.y, dir: player.dir };
    this.forget(client.sessionId);
    try {
      await this.deps.store.savePosition(this.spaceId, uid, position);
    } catch (err) {
      this.deps.onError?.('No se pudo guardar la posición', err);
    }
  }

  override async onDispose() {
    if (roomsBySpace.get(this.spaceId) === this) roomsBySpace.delete(this.spaceId);
    // Guarda lo que quede pendiente de las pizarras.
    await Promise.all([...this.boards.keys()].map((id) => this.saveBoard(id)));
  }

  /** El espacio se ha borrado: saca a todos sin guardar nada más. */
  closeDeleted() {
    this.deleted = true;
    void this.disconnect(LeaveCode.Removed);
  }

  /** Expulsa a una cuenta (ya no es miembro del espacio). */
  removeUser(userId: string) {
    for (const client of this.clients) {
      if (this.users.get(client.sessionId) === userId) client.leave(LeaveCode.Removed);
    }
  }

  /**
   * Se publicó un mapa nuevo: se usa desde ya, sin sacar a nadie. Quien queda sobre una casilla
   * bloqueada pasa a la libre más cercana, y se cierran las pizarras y mesas que ya no están (o que
   * quedaron lejos). Los clientes descargan el mapa y lo redibujan.
   */
  async reloadMap() {
    let next: WorldMap;
    let saved: Record<string, string>;
    try {
      const tiled = await this.deps.store.loadMap(this.spaceId);
      if (!tiled) return;
      next = parseWorldMap(tiled);
      saved = await this.deps.store.loadObjects(this.spaceId);
    } catch (err) {
      this.deps.onError?.('No se pudo cargar el mapa nuevo', err);
      return;
    }
    this.map = next;

    const values = new Map<string, string>();
    for (const o of next.objects) {
      if (EDITABLE_KINDS.includes(o.kind)) values.set(o.id, saved[o.id] ?? o.initial);
    }
    this.objectValues = values;

    for (const player of this.state.players.values()) {
      if (isWalkable(next, player.x, player.y)) continue;
      const to = nearestWalkable(next, player) ?? next.spawn;
      player.x = to.x;
      player.y = to.y;
    }

    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      const boardId = this.openBoards.get(client.sessionId);
      if (boardId && (!player || !this.isNearBoard(player, boardId))) {
        this.closeBoard(client.sessionId);
        this.sendBoardError(
          client,
          boardId,
          'El mapa ha cambiado: la pizarra ya no está aquí.',
          true,
        );
      }
      const gameId = this.openGames.get(client.sessionId);
      const table = next.objects.find((o) => o.id === gameId && o.kind === 'game');
      if (gameId && (!player || !table || !isWithinReach(player, table))) {
        this.closeGame(client.sessionId);
        this.sendGameError(client, gameId, 'El mapa ha cambiado: la mesa ya no está aquí.', true);
      }
    }
    // Lo cargado de pizarras que ya no existen se olvida (la API ya borró su contenido).
    for (const [boardId, doc] of this.boards) {
      if (next.whiteboards.some((b) => b.id === boardId)) continue;
      this.boards.delete(boardId);
      void doc.then(
        (d) => clearTimeout(d.saveTimer),
        () => {},
      );
    }

    this.broadcast(ServerMessage.MapChanged, {});
    this.broadcast(ServerMessage.ObjectContents, {
      contents: Object.fromEntries(this.objectValues),
    } satisfies ObjectContentsMessage);
  }

  /** La API cambió el rol de una cuenta: vale desde ya (y su interfaz se entera). */
  changeRole(userId: string, role: Role) {
    for (const client of this.clients) {
      if (this.users.get(client.sessionId) !== userId) continue;
      this.roles.set(client.sessionId, role);
      client.send(ServerMessage.RoleChanged, { role } satisfies RoleChangedMessage);
    }
  }

  private forget(sessionId: string) {
    this.closeBoard(sessionId);
    this.closeGame(sessionId);
    this.roles.delete(sessionId);
    this.state.players.delete(sessionId);
    this.limits.delete(sessionId);
    this.users.delete(sessionId);
  }

  private async loadPosition(uid: string) {
    try {
      return await this.deps.store.loadPosition(this.spaceId, uid);
    } catch (err) {
      this.deps.onError?.('No se pudo leer la posición', err);
      return null;
    }
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
      const boardId = this.openBoards.get(client.sessionId);
      if (boardId && !this.isNearBoard(next, boardId)) {
        this.closeBoard(client.sessionId);
        this.sendBoardError(client, boardId, 'Te alejaste de la pizarra.', true);
      }
      const gameId = this.openGames.get(client.sessionId);
      const table = gameId ? this.map.objects.find((o) => o.id === gameId) : undefined;
      if (gameId && table && !isWithinReach(next, table)) {
        this.closeGame(client.sessionId);
        this.sendGameError(client, gameId, 'Te alejaste de la mesa.', true);
      }
    }
  }

  // --- Pizarras ---

  private isNearBoard(p: { x: number; y: number }, boardId: string) {
    const board = this.map.whiteboards.find((b) => b.id === boardId);
    return !!board && distanceToRect(p, board) <= WHITEBOARD_REACH;
  }

  private loadBoard(boardId: string): Promise<BoardDocument> {
    let doc = this.boards.get(boardId);
    if (!doc) {
      doc = this.deps.store
        .loadBoard(this.spaceId, boardId)
        .then((saved) => new BoardDocument(saved));
      // Si falla, el siguiente intento vuelve a leer.
      doc.catch(() => this.boards.delete(boardId));
      this.boards.set(boardId, doc);
    }
    return doc;
  }

  private async handleBoardOpen(client: Client, raw: unknown) {
    const msg = parseBoardOpen(raw);
    const player = this.state.players.get(client.sessionId);
    if (!msg || !player) return;
    const { boardId } = msg;
    if (!this.isNearBoard(player, boardId)) {
      this.sendBoardError(client, boardId, 'Acércate a la pizarra para abrirla.', true);
      return;
    }
    this.closeBoard(client.sessionId);
    this.openBoards.set(client.sessionId, boardId);

    let doc: BoardDocument;
    try {
      doc = await this.loadBoard(boardId);
    } catch (err) {
      this.deps.onError?.('No se pudo leer la pizarra', err);
      if (this.openBoards.get(client.sessionId) === boardId) {
        this.openBoards.delete(client.sessionId);
        this.sendBoardError(client, boardId, 'No se pudo abrir la pizarra.', true);
      }
      return;
    }
    // Mientras cargaba pudo cerrarla, abrir otra o salir de la sala.
    if (this.openBoards.get(client.sessionId) !== boardId) return;
    doc.viewers.add(client.sessionId);
    client.send(ServerMessage.BoardScene, {
      boardId,
      elements: doc.list(),
    } satisfies BoardSceneMessage);
    this.sendViewers(boardId, doc);
  }

  /** Cierra la pizarra que tenga abierta la sesión (si tiene alguna). */
  private closeBoard(sessionId: string) {
    const boardId = this.openBoards.get(sessionId);
    if (!boardId) return;
    this.openBoards.delete(sessionId);
    void this.boards.get(boardId)?.then(
      (doc) => {
        if (!doc.viewers.delete(sessionId)) return;
        this.sendViewers(boardId, doc);
        // La última persona la ha cerrado: se guarda ya.
        if (doc.viewers.size === 0) void this.saveBoard(boardId);
      },
      () => {},
    );
  }

  /** El documento de la pizarra que la sesión tiene abierta (ya cargado), o null. */
  private async openDoc(client: Client, boardId: string) {
    if (this.openBoards.get(client.sessionId) !== boardId) return null;
    const doc = await this.boards.get(boardId)?.catch(() => null);
    return doc?.viewers.has(client.sessionId) ? doc : null;
  }

  private async handleBoardUpdate(client: Client, raw: unknown) {
    const limits = this.limits.get(client.sessionId);
    if (!limits?.boardUpdates.tryConsume(this.now())) return;
    const msg = parseBoardUpdate(raw);
    if (!msg) return;
    const doc = await this.openDoc(client, msg.boardId);
    if (!doc) return;

    const { accepted, stale, full } = doc.apply(msg.elements);
    if (accepted.length > 0) {
      this.sendToViewers(
        doc,
        ServerMessage.BoardUpdate,
        { boardId: msg.boardId, elements: accepted },
        client.sessionId,
      );
      this.scheduleSave(msg.boardId, doc);
    }
    if (full) {
      // Vuelve a sincronizar a quien no cupo: así ve lo que de verdad hay.
      this.sendBoardError(
        client,
        msg.boardId,
        'La pizarra está llena: borra algo para seguir dibujando.',
        false,
      );
      client.send(ServerMessage.BoardScene, {
        boardId: msg.boardId,
        elements: doc.list(),
      } satisfies BoardSceneMessage);
    } else if (stale.length > 0) {
      client.send(ServerMessage.BoardUpdate, {
        boardId: msg.boardId,
        elements: stale,
      } satisfies BoardUpdateMessage);
    }
  }

  private async handleBoardPointer(client: Client, raw: unknown) {
    const limits = this.limits.get(client.sessionId);
    if (!limits?.boardPointer.tryConsume(this.now())) return;
    const msg = parseBoardPointer(raw);
    if (!msg) return;
    const doc = await this.openDoc(client, msg.boardId);
    if (!doc) return;
    this.sendToViewers(
      doc,
      ServerMessage.BoardPointer,
      { ...msg, sessionId: client.sessionId } satisfies BoardRemotePointerMessage,
      client.sessionId,
    );
  }

  private sendToViewers(doc: BoardDocument, type: string, message: unknown, except?: string) {
    for (const c of this.clients) {
      if (c.sessionId !== except && doc.viewers.has(c.sessionId)) c.send(type, message);
    }
  }

  private sendViewers(boardId: string, doc: BoardDocument) {
    const viewers = [...doc.viewers].flatMap((sessionId) => {
      const p = this.state.players.get(sessionId);
      return p ? [{ sessionId, name: p.name, avatar: p.avatar }] : [];
    });
    this.sendToViewers(doc, ServerMessage.BoardViewers, {
      boardId,
      viewers,
    } satisfies BoardViewersMessage);
  }

  private sendBoardError(client: Client, boardId: string, message: string, closed: boolean) {
    client.send(ServerMessage.BoardError, { boardId, message, closed } satisfies BoardErrorMessage);
  }

  private scheduleSave(boardId: string, doc: BoardDocument) {
    clearTimeout(doc.saveTimer);
    doc.saveTimer = setTimeout(() => void this.saveBoard(boardId), WHITEBOARD_SAVE_DELAY_MS);
  }

  /** Guarda la pizarra si tiene cambios. Los guardados de una misma pizarra van en orden. */
  private async saveBoard(boardId: string) {
    const doc = await this.boards.get(boardId)?.catch(() => null);
    if (!doc) return;
    clearTimeout(doc.saveTimer);
    doc.saving = doc.saving.then(async () => {
      if (!doc.dirty || this.deleted) return;
      doc.dirty = false;
      const elements: BoardElement[] = doc.list();
      try {
        await this.deps.store.saveBoard(this.spaceId, boardId, elements);
      } catch (err) {
        doc.dirty = true;
        this.deps.onError?.('No se pudo guardar la pizarra', err);
      }
    });
    await doc.saving;
  }

  private handleMediaTicket(client: Client) {
    const limits = this.limits.get(client.sessionId);
    if (!limits || this.now() - limits.lastTicketAt < MEDIA_TICKET_COOLDOWN_MS) return;
    limits.lastTicketAt = this.now();
    this.sendMediaTicket(client);
  }

  private sendMediaTicket(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const ticket = signMediaTicket(
      {
        sid: client.sessionId,
        room: this.mediaRoom,
        name: player.name,
        exp: this.now() + MEDIA_TICKET_TTL_MS,
      },
      this.deps.ticketSecret,
    );
    client.send(ServerMessage.MediaTicket, { ticket } satisfies MediaTicketMessage);
  }

  // --- Objetos (enlaces, videos y notas) ---

  private async handleObjectEdit(client: Client, raw: unknown) {
    const msg = parseObjectEdit(raw);
    const limits = this.limits.get(client.sessionId);
    const role = this.roles.get(client.sessionId);
    if (!msg || !limits || !role) return;
    const fail = (message: string) =>
      client.send(ServerMessage.ObjectError, {
        objectId: msg.objectId,
        message,
      } satisfies ObjectErrorMessage);

    const object = this.map.objects.find((o) => o.id === msg.objectId);
    if (!object || !EDITABLE_KINDS.includes(object.kind)) return;
    if (!canEditObjects(role)) return fail('Solo el dueño y los admins pueden cambiar esto.');
    if (!limits.objectEdits.tryConsume(this.now())) {
      return fail('Demasiados cambios seguidos. Espera un momento.');
    }
    const parsed = parseObjectValue(object.kind, msg.value);
    if (!parsed.ok) return fail(parsed.error);

    const save = this.objectSaves.then(async () => {
      if (this.deleted) return;
      await this.deps.store.saveObject(this.spaceId, object.id, parsed.value);
      this.objectValues.set(object.id, parsed.value);
      this.broadcast(ServerMessage.ObjectContent, {
        objectId: object.id,
        value: parsed.value,
      } satisfies ObjectContentMessage);
    });
    this.objectSaves = save.catch(() => {});
    try {
      await save;
    } catch (err) {
      this.deps.onError?.('No se pudo guardar el objeto', err);
      fail('No se pudo guardar. Inténtalo de nuevo.');
    }
  }

  // --- Mesas de juego (tres en raya) ---

  private handleGameOpen(client: Client, raw: unknown) {
    const msg = parseGameOpen(raw);
    const player = this.state.players.get(client.sessionId);
    if (!msg || !player) return;
    const table = this.map.objects.find((o) => o.id === msg.objectId && o.kind === 'game');
    if (!table) return;
    if (!isWithinReach(player, table)) {
      this.sendGameError(client, table.id, 'Acércate a la mesa para jugar.', true);
      return;
    }
    if (this.openGames.get(client.sessionId) === table.id) return;
    this.closeGame(client.sessionId);
    let entry = this.games.get(table.id);
    if (!entry) {
      entry = { game: new TicTacToe(), viewers: new Set() };
      this.games.set(table.id, entry);
    }
    entry.viewers.add(client.sessionId);
    this.openGames.set(client.sessionId, table.id);
    this.sendGameState(table.id, entry);
  }

  /** Cierra la mesa que tenga abierta la sesión (y deja su asiento). */
  private closeGame(sessionId: string) {
    const objectId = this.openGames.get(sessionId);
    if (!objectId) return;
    this.openGames.delete(sessionId);
    const entry = this.games.get(objectId);
    if (!entry) return;
    entry.viewers.delete(sessionId);
    entry.game.stand(sessionId);
    if (entry.viewers.size === 0) this.games.delete(objectId);
    else this.sendGameState(objectId, entry);
  }

  /** Aplica una acción en la mesa abierta: si sale bien, todos los que miran ven el cambio. */
  private gameAction(client: Client, action: (game: TicTacToe, player: Player) => string | null) {
    const objectId = this.openGames.get(client.sessionId);
    const entry = objectId ? this.games.get(objectId) : undefined;
    const player = this.state.players.get(client.sessionId);
    const limits = this.limits.get(client.sessionId);
    if (!objectId || !entry || !player || !limits?.games.tryConsume(this.now())) return;
    const error = action(entry.game, player);
    if (error) this.sendGameError(client, objectId, error, false);
    else this.sendGameState(objectId, entry);
  }

  private sendGameState(objectId: string, { game, viewers }: GameTable) {
    const message: GameStateMessage = {
      objectId,
      board: game.board,
      seats: game.seats,
      turn: game.turn,
      outcome: game.outcome,
      watching: viewers.size,
    };
    for (const c of this.clients) {
      if (viewers.has(c.sessionId)) c.send(ServerMessage.GameState, message);
    }
  }

  private sendGameError(client: Client, objectId: string, message: string, closed: boolean) {
    client.send(ServerMessage.GameError, { objectId, message, closed } satisfies GameErrorMessage);
  }

  // --- Reacciones ---

  private handleEmote(client: Client, raw: unknown) {
    const msg = parseEmote(raw);
    const limits = this.limits.get(client.sessionId);
    if (!msg || !this.state.players.has(client.sessionId)) return;
    if (!limits?.emotes.tryConsume(this.now())) return;
    this.broadcast(ServerMessage.Emote, {
      sessionId: client.sessionId,
      emote: msg.emote,
    } satisfies RemoteEmoteMessage);
  }

  private handleHand(client: Client, raw: unknown) {
    const msg = parseHand(raw);
    const player = this.state.players.get(client.sessionId);
    const limits = this.limits.get(client.sessionId);
    if (!msg || !player || player.hand === msg.raised) return;
    if (!limits?.emotes.tryConsume(this.now())) return;
    player.hand = msg.raised;
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
