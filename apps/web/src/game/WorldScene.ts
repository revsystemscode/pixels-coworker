import Phaser from 'phaser';
import { Callbacks, type Room } from '@colyseus/sdk';
import {
  AVATAR_COUNT,
  ClientMessage,
  DIRECTIONS,
  TILE_SIZE,
  WHITEBOARD_REACH,
  distanceToRect,
  findPath,
  findPathWhere,
  parseWorldMap,
  whiteboardAt,
  whiteboardNear,
  type Direction,
  type TiledMap,
  type Whiteboard,
  type WorldMap,
} from '@pixels/shared';
import { useBoard } from '../whiteboard/store.js';
import { Avatar } from './Avatar.js';
import { CHARACTER_SHEET, WALK_FRAME_RATE, walkAnimKey, walkFrames } from './characters.js';
import { Predictor } from './prediction.js';

/** Vista del estado de un jugador tal como llega del servidor. */
interface PlayerState {
  name: string;
  avatar: number;
  x: number;
  y: number;
  dir: Direction;
  seq: number;
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
  /** Pizarra que se abrirá al llegar (tras hacer clic en ella desde lejos). */
  private boardTarget: Whiteboard | null = null;
  private boardHighlights = new Map<string, Phaser.GameObjects.Graphics>();

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
    this.load.spritesheet(CHARACTER_SHEET.key, CHARACTER_SHEET.url, {
      frameWidth: CHARACTER_SHEET.frameSize,
      frameHeight: CHARACTER_SHEET.frameSize,
    });
  }

  create() {
    this.createMap();
    this.createAnimations();
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
    this.createWhiteboards();

    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor('#12161f');
    cam.roundPixels = true;
  }

  /** Dibuja las pizarras del mapa (el pack de Kenney no trae ninguna) y su resaltado. */
  private createWhiteboards() {
    const T = TILE_SIZE;
    for (const b of this.world.whiteboards) {
      const x = b.x * T + 2;
      const y = b.y * T + 3;
      const w = b.width * T - 4;
      const h = b.height * T - 7;
      const g = this.add.graphics().setDepth(VISIBLE_LAYERS.length);
      g.fillStyle(0x6b7280).fillRect(x, y, w, h); // marco
      g.fillStyle(0xf8fafc).fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle(0x9ca3af).fillRect(x + 2, y + h, w - 4, 2); // bandeja
      // Unos trazos de rotulador.
      g.fillStyle(0x3b82f6).fillRect(x + 4, y + 4, Math.min(14, w - 8), 1);
      g.fillStyle(0x3b82f6).fillRect(x + 4, y + 7, Math.min(9, w - 8), 1);
      g.fillStyle(0xef4444).fillRect(x + w - 14, y + 5, 8, 5);
      g.fillStyle(0xf8fafc).fillRect(x + w - 13, y + 6, 6, 3);

      const highlight = this.add
        .graphics()
        .setDepth(VISIBLE_LAYERS.length)
        .lineStyle(1, 0xfacc15)
        .strokeRect(x - 1.5, y - 1.5, w + 3, h + 4)
        .setVisible(false);
      this.boardHighlights.set(b.id, highlight);
    }
  }

  private createAnimations() {
    for (let avatar = 0; avatar < AVATAR_COUNT; avatar++) {
      for (const dir of DIRECTIONS) {
        const key = walkAnimKey(avatar, dir);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(CHARACTER_SHEET.key, {
            frames: walkFrames(avatar, dir),
          }),
          frameRate: WALK_FRAME_RATE,
          repeat: -1,
        });
      }
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

    // E abre la pizarra que tengamos cerca.
    kb.addKey(K.E, false).on('down', () => {
      const { near, open } = useBoard.getState();
      if (near && !open && !this.typing()) this.openBoard(near);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.predictor || useBoard.getState().open) return;
      const target = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      this.boardTarget = null;
      // Clic en una pizarra: se abre (caminando antes hasta ella si está lejos).
      const board = whiteboardAt(this.world, target);
      if (board) {
        const here = this.predictor.position;
        this.path =
          findPathWhere(
            this.world,
            here,
            (x, y) => distanceToRect({ x, y }, board) <= WHITEBOARD_REACH,
          ) ?? [];
        if (this.path.length === 0 && distanceToRect(here, board) <= WHITEBOARD_REACH) {
          this.openBoard(board);
        } else if (this.path.length > 0) {
          this.boardTarget = board;
        }
        return;
      }
      this.path = findPath(this.world, this.predictor.position, target) ?? [];
    });
  }

  private openBoard(board: Whiteboard) {
    this.boardTarget = null;
    this.path = [];
    useBoard.getState().openBoard(this.room, board);
  }

  /** Avisa a la interfaz de qué pizarra tenemos cerca y la resalta en el mapa. */
  private updateNearBoard() {
    if (!this.predictor) return;
    const near = whiteboardNear(this.world, this.predictor.position);
    if (useBoard.getState().near?.id !== near?.id) {
      useBoard.setState({ near });
      for (const [id, g] of this.boardHighlights) g.setVisible(id === near?.id);
    }
  }

  private bindState() {
    const callbacks = Callbacks.get(this.room);

    this.detach.push(
      callbacks.onAdd('players', (value, key) => {
        const player = value as PlayerState;
        const sessionId = key as string;
        const isSelf = sessionId === this.room.sessionId;
        const avatar = new Avatar(
          this,
          player.avatar,
          player.name,
          { x: player.x, y: player.y },
          player.dir,
          this.zoom,
        );
        this.avatars.set(sessionId, avatar);

        if (isSelf) {
          this.self = avatar;
          this.predictor = new Predictor(this.world, player);
          this.cameras.main.startFollow(avatar.sprite, true);
        }

        this.detach.push(
          callbacks.onChange(player, () => {
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
      }),
    );
  }

  override update() {
    if (!this.self || !this.predictor || this.self.isMoving) return;
    this.updateNearBoard();
    // Con la pizarra abierta, el teclado es para dibujar.
    if (useBoard.getState().open) return;

    const keyDir = this.typing() ? null : this.heldDirection();
    if (keyDir) {
      this.path = [];
      this.boardTarget = null;
    }
    const dir = keyDir ?? this.path.shift();
    if (!dir) {
      if (this.boardTarget && useBoard.getState().near?.id === this.boardTarget.id) {
        this.openBoard(this.boardTarget);
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
      })),
    };
  }

  private cleanup() {
    useBoard.setState({ near: null });
    this.boardHighlights.clear();
    this.detach.forEach((off) => off());
    this.detach = [];
    this.avatars.forEach((a) => a.destroy());
    this.avatars.clear();
    this.self = null;
    this.predictor = null;
  }
}
