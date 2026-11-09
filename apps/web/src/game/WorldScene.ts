import Phaser from 'phaser';
import { Callbacks, type Room } from '@colyseus/sdk';
import {
  ClientMessage,
  DIRECTIONS,
  EMOTES,
  EMOTE_IDS,
  ServerMessage,
  TILE_SIZE,
  findPath,
  findPathWhere,
  interactableAt,
  interactableNear,
  isWithinReach,
  parseWorldMap,
  type Direction,
  type Interactable,
  type RemoteEmoteMessage,
  type TiledMap,
  type WorldMap,
} from '@pixels/shared';
import { openMapObject } from '../objects/open.js';
import { useObjects } from '../objects/store.js';
import { useGame } from '../tictactoe/store.js';
import {
  forgetReactions,
  sendEmote,
  setHand,
  showEmote,
  toggleHand,
  useReactions,
} from '../reactions/store.js';
import { useBoard } from '../whiteboard/store.js';
import { Avatar } from './Avatar.js';
import { drawObject, drawWhiteboard } from './objectArt.js';
import {
  CHARACTER_SHEET,
  FRAMES_PER_LOOK,
  LOOK_WIDTH,
  WALK_FRAME_RATE,
  lookCanvas,
  lookTextureKey,
  walkAnimKey,
  walkFrames,
} from './characters.js';
import { Predictor } from './prediction.js';

/** Vista del estado de un jugador tal como llega del servidor. */
interface PlayerState {
  name: string;
  avatar: number;
  x: number;
  y: number;
  dir: Direction;
  seq: number;
  hand: boolean;
}

export interface WorldSceneData {
  room: Room;
  /** Mapa del espacio (Tiled JSON), el mismo que usa el servidor. */
  map: TiledMap;
}

const MAP_KEY = 'space-map';

const TILESETS = [
  { name: 'kenney-roguelike-base', url: '/assets/tilesets/kenney-roguelike-base.png' },
  { name: 'kenney-roguelike-indoor', url: '/assets/tilesets/kenney-roguelike-indoor.png' },
];
const VISIBLE_LAYERS = ['floor', 'walls', 'decor-below', 'furniture'];

/** Distancia (px del mundo) del centro del avatar a la parte de arriba de su nombre. */
const HEAD_OFFSET = 18;

type KeyMap = Record<Direction, Phaser.Input.Keyboard.Key[]>;

export class WorldScene extends Phaser.Scene {
  private room!: Room;
  private tiled!: TiledMap;
  private world!: WorldMap;
  private zoom = 3;
  private avatars = new Map<string, Avatar>();
  private self: Avatar | null = null;
  private predictor: Predictor | null = null;
  private path: Direction[] = [];
  private keys!: KeyMap;
  private detach: (() => void)[] = [];
  /** Pizarra u objeto que se abrirá al llegar (tras hacer clic en él desde lejos). */
  private target: Interactable | null = null;
  /** Resaltado de cada pizarra y objeto (se ve el que tenemos cerca). */
  private highlights = new Map<string, Phaser.GameObjects.Graphics>();
  private nearId: string | null = null;

  constructor() {
    super('world');
  }

  init(data: WorldSceneData) {
    this.room = data.room;
    this.tiled = data.map;
    this.world = parseWorldMap(data.map);
    this.zoom = this.scale.width < 720 ? 2 : 3;
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, this.tiled);
    for (const t of TILESETS) this.load.image(t.name, t.url);
    this.load.image(CHARACTER_SHEET.key, CHARACTER_SHEET.url);
  }

  create() {
    this.createMap();
    this.createInput();
    this.bindState();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private createMap() {
    const map = this.make.tilemap({ key: MAP_KEY });
    const tilesets = TILESETS.map((t) => map.addTilesetImage(t.name, t.name)).filter(
      (t): t is Phaser.Tilemaps.Tileset => t !== null,
    );
    VISIBLE_LAYERS.forEach((name, i) => map.createLayer(name, tilesets)?.setDepth(i));
    this.createInteractables();

    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor('#12161f');
    cam.roundPixels = true;
  }

  /** Dibuja las pizarras y los objetos del mapa, y su resaltado (oculto hasta acercarse). */
  private createInteractables() {
    const depth = VISIBLE_LAYERS.length;
    const add = (
      id: string,
      draw: (g: Phaser.GameObjects.Graphics) => ReturnType<typeof drawObject>,
    ) => {
      const { x, y, w, h } = draw(this.add.graphics().setDepth(depth));
      const highlight = this.add
        .graphics()
        .setDepth(depth)
        .lineStyle(1, 0xfacc15)
        .strokeRect(x - 1.5, y - 1.5, w + 3, h + 3)
        .setVisible(false);
      this.highlights.set(id, highlight);
    };
    for (const b of this.world.whiteboards) add(b.id, (g) => drawWhiteboard(g, b));
    for (const o of this.world.objects) add(o.id, (g) => drawObject(g, o));
  }

  /** Crea (la primera vez) la textura y las animaciones de un aspecto de avatar. */
  private ensureLook(avatar: number) {
    const key = lookTextureKey(avatar);
    if (this.textures.exists(key)) return;
    const sheet = this.textures.get(CHARACTER_SHEET.key).getSourceImage() as HTMLImageElement;
    const texture = this.textures.addCanvas(key, lookCanvas(sheet, avatar))!;
    const size = CHARACTER_SHEET.frameSize;
    const columns = LOOK_WIDTH / size;
    for (let i = 0; i < FRAMES_PER_LOOK; i++) {
      texture.add(i, 0, (i % columns) * size, Math.floor(i / columns) * size, size, size);
    }
    for (const dir of DIRECTIONS) {
      this.anims.create({
        key: walkAnimKey(avatar, dir),
        frames: walkFrames(dir).map((frame) => ({ key, frame })),
        frameRate: WALK_FRAME_RATE,
        repeat: -1,
      });
    }
  }

  private createInput() {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    // enableCapture = false: no bloquear esas teclas en los campos de texto (chat).
    const add = (...codes: number[]) => codes.map((c) => kb.addKey(c, false));
    this.keys = {
      up: add(K.UP, K.W),
      down: add(K.DOWN, K.S),
      left: add(K.LEFT, K.A),
      right: add(K.RIGHT, K.D),
    };

    // E abre la pizarra o el objeto que tengamos cerca.
    kb.addKey(K.E, false).on('down', () => {
      if (this.typing() || useBoard.getState().open) return;
      if (useObjects.getState().open || useGame.getState().open) return;
      const near = this.nearInteractable();
      if (near) this.openInteractable(near);
    });

    // 1–6: reacciones. H: levantar o bajar la mano.
    const canReact = () => !this.typing() && !useBoard.getState().open;
    const numbers = [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX];
    EMOTE_IDS.forEach((emote, i) =>
      kb.addKey(numbers[i]!, false).on('down', () => {
        if (canReact()) sendEmote(this.room, emote);
      }),
    );
    kb.addKey(K.H, false).on('down', () => {
      if (canReact()) toggleHand(this.room);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.predictor || useBoard.getState().open) return;
      const target = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      this.target = null;
      // Clic en una pizarra u objeto: se abre (caminando antes hasta él si está lejos).
      const clicked = interactableAt(this.world, target);
      if (clicked) {
        const here = this.predictor.position;
        this.path =
          findPathWhere(this.world, here, (x, y) => isWithinReach({ x, y }, clicked.item)) ?? [];
        if (this.path.length === 0 && isWithinReach(here, clicked.item)) {
          this.openInteractable(clicked);
        } else if (this.path.length > 0) {
          this.target = clicked;
        }
        return;
      }
      this.path = findPath(this.world, this.predictor.position, target) ?? [];
    });
  }

  private openInteractable(it: Interactable) {
    this.target = null;
    this.path = [];
    if (it.type === 'board') {
      useObjects.getState().close();
      useGame.getState().close();
      useBoard.getState().openBoard(this.room, it.item);
    } else {
      openMapObject(this.room, it.item);
    }
  }

  private nearInteractable(): Interactable | null {
    const board = useBoard.getState().near;
    const object = useObjects.getState().near;
    if (board) return { type: 'board', item: board };
    return object ? { type: 'object', item: object } : null;
  }

  /**
   * Avisa a la interfaz de qué tenemos cerca y lo resalta en el mapa. Si nos alejamos de un objeto
   * abierto, se cierra.
   */
  private updateNear() {
    if (!this.predictor) return;
    const here = this.predictor.position;
    const near = interactableNear(this.world, here);
    if (this.nearId !== (near?.item.id ?? null)) {
      this.nearId = near?.item.id ?? null;
      useBoard.setState({ near: near?.type === 'board' ? near.item : null });
      useObjects.setState({ near: near?.type === 'object' ? near.item : null });
      for (const [id, g] of this.highlights) g.setVisible(id === this.nearId);
    }
    const open = useObjects.getState().open;
    if (open && !isWithinReach(here, open)) {
      useObjects.getState().close(`Te alejaste de «${open.name}».`);
    }
  }

  private bindState() {
    const callbacks = Callbacks.get(this.room);

    this.detach.push(
      callbacks.onAdd('players', (value, key) => {
        const player = value as PlayerState;
        const sessionId = key as string;
        const isSelf = sessionId === this.room.sessionId;
        this.ensureLook(player.avatar);
        const avatar = new Avatar(
          this,
          player.avatar,
          player.name,
          { x: player.x, y: player.y },
          player.dir,
          this.zoom,
        );
        this.avatars.set(sessionId, avatar);
        avatar.setHand(player.hand);
        setHand(sessionId, player.hand);

        if (isSelf) {
          useReactions.setState({ handRaised: player.hand });
          this.self = avatar;
          this.predictor = new Predictor(this.world, player);
          this.cameras.main.startFollow(avatar.sprite, true);
        }

        this.detach.push(
          callbacks.onChange(player, () => {
            // Solo cuando cambia en el servidor (no deshace lo que acabo de pulsar).
            if (player.hand !== avatar.handRaised) {
              avatar.setHand(player.hand);
              setHand(sessionId, player.hand);
              if (isSelf) useReactions.setState({ handRaised: player.hand });
            }
            if (isSelf) {
              const corrected = this.predictor?.reconcile(player);
              if (corrected) {
                this.path = [];
                avatar.snapTo(corrected);
              }
            } else {
              avatar.pushRemote({ x: player.x, y: player.y }, player.dir);
            }
          }),
        );
      }),

      callbacks.onRemove('players', (_value, key) => {
        const sessionId = key as string;
        this.avatars.get(sessionId)?.destroy();
        this.avatars.delete(sessionId);
        forgetReactions(sessionId);
      }),

      this.room.onMessage(ServerMessage.Emote, (m: RemoteEmoteMessage) => {
        const emote = EMOTES[m.emote];
        const avatar = this.avatars.get(m.sessionId);
        if (!emote || !avatar) return;
        avatar.showEmote(emote.emoji);
        showEmote(m.sessionId, emote.emoji);
      }),
    );
  }

  override update() {
    if (!this.self || !this.predictor || this.self.isMoving) return;
    this.updateNear();
    // Con la pizarra abierta, el teclado es para dibujar.
    if (useBoard.getState().open) return;

    const keyDir = this.typing() ? null : this.heldDirection();
    if (keyDir) {
      this.path = [];
      this.target = null;
    }
    const dir = keyDir ?? this.path.shift();
    if (!dir) {
      if (this.target && this.nearId === this.target.item.id) {
        this.openInteractable(this.target);
      }
      return;
    }

    const { seq, next } = this.predictor.step(dir);
    this.room.send(ClientMessage.Step, { dir, seq });
    if (next) {
      this.self.walkTo(next, dir);
    } else {
      this.self.face(dir);
      this.path = [];
    }
  }

  /** Dirección de la tecla pulsada (la última de la lista gana si hay varias). */
  private heldDirection(): Direction | null {
    let found: Direction | null = null;
    for (const dir of DIRECTIONS) if (this.keys[dir].some((k) => k.isDown)) found = dir;
    return found;
  }

  /** True si el foco está en un campo de texto (chat): el teclado no mueve al avatar. */
  private typing() {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  /**
   * Punto sobre la cabeza de cada avatar (encima del nombre), en píxeles CSS relativos al canvas.
   * Sirve para colocar las burbujas de video.
   */
  headPositions(): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    // Antes de que la escena arranque no hay cámara.
    const cam = this.cameras?.main;
    if (!cam) return result;
    for (const [id, a] of this.avatars) {
      result.set(id, {
        x: (a.sprite.x - cam.worldView.x) * cam.zoom,
        y: (a.sprite.y - HEAD_OFFSET - cam.worldView.y) * cam.zoom,
      });
    }
    return result;
  }

  /** Solo pruebas E2E: camina hasta una casilla como si se hubiera hecho clic en ella. */
  debugWalkTo(target: { x: number; y: number }): boolean {
    if (!this.predictor) return false;
    const path = findPath(this.world, this.predictor.position, target);
    this.path = path ?? [];
    return path !== null;
  }

  /** Datos para pruebas E2E y depuración. */
  debugSnapshot() {
    return {
      selfId: this.room.sessionId,
      tile: this.predictor?.position ?? null,
      fps: Math.round(this.game.loop.actualFps),
      players: [...this.avatars.entries()].map(([id, a]) => ({
        id,
        x: Math.round(a.sprite.x),
        y: Math.round(a.sprite.y),
        avatar: a.look,
        hand: a.handRaised,
        emote: a.currentEmote,
      })),
    };
  }

  private cleanup() {
    useBoard.setState({ near: null });
    useObjects.setState({ near: null });
    useReactions.setState({ handRaised: false, hands: {}, emotes: {} });
    this.highlights.clear();
    this.nearId = null;
    this.detach.forEach((off) => off());
    this.detach = [];
    this.avatars.forEach((a) => a.destroy());
    this.avatars.clear();
    this.self = null;
    this.predictor = null;
  }
}
