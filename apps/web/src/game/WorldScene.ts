import Phaser from 'phaser';
import { Callbacks, type Room } from '@colyseus/sdk';
import {
  AVATAR_COUNT,
  ClientMessage,
  DEFAULT_MAP,
  DIRECTIONS,
  MAPS,
  TILE_SIZE,
  findPath,
  parseWorldMap,
  type Direction,
  type WorldMap,
} from '@pixels/shared';
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
}

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
  private world!: WorldMap;
  private zoom = 3;
  private avatars = new Map<string, Avatar>();
  private self: Avatar | null = null;
  private predictor: Predictor | null = null;
  private path: Direction[] = [];
  private keys!: KeyMap;
  private detach: (() => void)[] = [];

  constructor() {
    super('world');
  }

  init(data: WorldSceneData) {
    this.room = data.room;
    this.world = parseWorldMap(MAPS[DEFAULT_MAP]);
    this.zoom = this.scale.width < 720 ? 2 : 3;
  }

  preload() {
    this.load.tilemapTiledJSON(DEFAULT_MAP, MAPS[DEFAULT_MAP]);
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
    const map = this.make.tilemap({ key: DEFAULT_MAP });
    const tilesets = TILESETS.map((t) => map.addTilesetImage(t.name, t.name)).filter(
      (t): t is Phaser.Tilemaps.Tileset => t !== null,
    );
    VISIBLE_LAYERS.forEach((name, i) => map.createLayer(name, tilesets)?.setDepth(i));

    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor('#12161f');
    cam.roundPixels = true;
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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.predictor) return;
      const target = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      this.path = findPath(this.world, this.predictor.position, target) ?? [];
    });
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

    const keyDir = this.typing() ? null : this.heldDirection();
    if (keyDir) this.path = [];
    const dir = keyDir ?? this.path.shift();
    if (!dir) return;

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

  /** Datos para pruebas E2E y depuración. */
  debugSnapshot() {
    return {
      selfId: this.room.sessionId,
      fps: Math.round(this.game.loop.actualFps),
      players: [...this.avatars.entries()].map(([id, a]) => ({
        id,
        x: Math.round(a.sprite.x),
        y: Math.round(a.sprite.y),
      })),
    };
  }

  private cleanup() {
    this.detach.forEach((off) => off());
    this.detach = [];
    this.avatars.forEach((a) => a.destroy());
    this.avatars.clear();
    this.self = null;
    this.predictor = null;
  }
}
