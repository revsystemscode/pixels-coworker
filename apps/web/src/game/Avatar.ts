import type Phaser from 'phaser';
import {
  EMOTE_DURATION_MS,
  HAND_EMOJI,
  MOVE_DURATION_MS,
  TILE_SIZE,
  type Direction,
  type Point,
} from '@pixels/shared';
import { idleFrame, lookTextureKey, walkAnimKey } from './characters.js';

const LABEL_FONT_PX = 24;
const EMOTE_FONT_PX = 48;
const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
// Si un jugador remoto acumula más pasos que esto sin dibujar, se teletransporta para no ir con retraso.
const MAX_QUEUE = 3;

const center = (tile: Point) => ({
  x: tile.x * TILE_SIZE + TILE_SIZE / 2,
  y: tile.y * TILE_SIZE + TILE_SIZE / 2,
});

/** Sprite de un jugador con su nombre encima. Se mueve de casilla en casilla. */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private emote: Phaser.GameObjects.Text | null = null;
  /** Desplazamiento vertical de la reacción (sube mientras se desvanece). */
  private emoteRise = 0;
  private hand = false;
  private tile: Point;
  private dir: Direction;
  private queue: { tile: Point; dir: Direction }[] = [];
  private moving = false;
  private idleTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly avatar: number,
    private readonly name: string,
    tile: Point,
    dir: Direction,
    private readonly zoom: number,
  ) {
    this.tile = tile;
    this.dir = dir;
    const { x, y } = center(tile);
    this.sprite = scene.add.sprite(x, y, lookTextureKey(avatar), idleFrame(dir));
    // Texto grande escalado hacia abajo: se ve nítido con el zoom de la cámara.
    this.label = scene.add
      .text(x, y, name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${LABEL_FONT_PX}px`,
        color: '#ffffff',
        stroke: '#1d2330',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setScale(1 / zoom)
      .setDepth(10_000);
    this.sync();
  }

  get isMoving() {
    return this.moving;
  }

  /** Camina una casilla (movimiento propio, ya validado por la predicción). */
  walkTo(tile: Point, dir: Direction, onDone?: () => void) {
    this.cancelIdle();
    this.dir = dir;
    this.moving = true;
    this.sprite.play(walkAnimKey(this.avatar, dir), true);
    const target = center(tile);
    this.tile = tile;
    this.scene.tweens.add({
      targets: this.sprite,
      x: target.x,
      y: target.y,
      duration: MOVE_DURATION_MS,
      onUpdate: () => this.sync(),
      onComplete: () => {
        this.moving = false;
        this.sync();
        if (onDone) onDone();
        else this.idleSoon();
      },
    });
  }

  /** Mira hacia una dirección sin moverse. */
  face(dir: Direction) {
    this.dir = dir;
    if (!this.moving) this.idle();
  }

  /** Detiene la animación y muestra el frame de reposo. */
  idle() {
    this.cancelIdle();
    this.sprite.stop();
    this.sprite.setFrame(idleFrame(this.dir));
  }

  /**
   * Pasa a reposo tras una pausa corta. Si llega otro paso antes, la animación sigue sin cortes
   * (evita parpadeos entre casillas cuando los pasos llegan con algo de retraso).
   */
  idleSoon(delayMs = 90) {
    if (this.idleTimer) return;
    this.idleTimer = this.scene.time.delayedCall(delayMs, () => {
      this.idleTimer = null;
      if (!this.moving) this.idle();
    });
  }

  private cancelIdle() {
    this.idleTimer?.remove(false);
    this.idleTimer = null;
  }

  /** Coloca el avatar en una casilla sin animación (correcciones o saltos grandes). */
  snapTo(tile: Point, dir: Direction = this.dir) {
    this.scene.tweens.killTweensOf(this.sprite);
    this.queue = [];
    this.moving = false;
    this.tile = tile;
    this.dir = dir;
    const { x, y } = center(tile);
    this.sprite.setPosition(x, y);
    this.idle();
    this.sync();
  }

  /** Para jugadores remotos: encola la nueva posición e interpola hacia ella. */
  pushRemote(tile: Point, dir: Direction) {
    const last = this.queue.at(-1)?.tile ?? this.tile;
    const distance = Math.abs(tile.x - last.x) + Math.abs(tile.y - last.y);
    if (distance === 0) {
      this.face(dir);
      return;
    }
    if (distance > 1 || this.queue.length >= MAX_QUEUE) {
      this.snapTo(tile, dir);
      return;
    }
    this.queue.push({ tile, dir });
    if (!this.moving) this.nextRemote();
  }

  private nextRemote() {
    const next = this.queue.shift();
    if (!next) {
      this.idleSoon();
      return;
    }
    this.walkTo(next.tile, next.dir, () => this.nextRemote());
  }

  /** Muestra una reacción sobre la cabeza unos segundos (sustituye a la anterior). */
  showEmote(emoji: string) {
    this.clearEmote();
    const emote = this.scene.add
      .text(0, 0, emoji, { fontFamily: EMOJI_FONTS, fontSize: `${EMOTE_FONT_PX}px` })
      .setOrigin(0.5, 1)
      .setScale(1 / this.zoom)
      .setDepth(10_001);
    this.emote = emote;
    this.emoteRise = 0;
    this.scene.tweens.add({
      targets: this,
      emoteRise: 6,
      duration: EMOTE_DURATION_MS,
      onUpdate: () => this.sync(),
    });
    this.scene.tweens.add({
      targets: emote,
      alpha: 0,
      delay: EMOTE_DURATION_MS * 0.7,
      duration: EMOTE_DURATION_MS * 0.3,
      onComplete: () => {
        if (this.emote === emote) this.clearEmote();
      },
    });
    this.sync();
  }

  /** Mano levantada: se ve junto al nombre. */
  setHand(raised: boolean) {
    if (raised === this.hand) return;
    this.hand = raised;
    this.label.setText(raised ? `${HAND_EMOJI} ${this.name}` : this.name);
  }

  /** Aspecto (personaje y colores). */
  get look() {
    return this.avatar;
  }

  get handRaised() {
    return this.hand;
  }

  /** La reacción que se ve ahora (para pruebas). */
  get currentEmote() {
    return this.emote?.text ?? null;
  }

  private clearEmote() {
    if (!this.emote) return;
    this.scene.tweens.killTweensOf(this.emote);
    this.scene.tweens.killTweensOf(this);
    this.emote.destroy();
    this.emote = null;
  }

  /** Mantiene la etiqueta encima y ordena en profundidad (lo de más abajo se dibuja encima). */
  private sync() {
    this.label.setPosition(this.sprite.x, this.sprite.y - TILE_SIZE / 2 - 1);
    // Si tiene burbuja de video, la tapa; por eso la reacción también se ve en la burbuja.
    this.emote?.setPosition(
      this.sprite.x,
      this.label.y - this.label.displayHeight - 1 - this.emoteRise,
    );
    this.sprite.setDepth(100 + this.sprite.y);
  }

  destroy() {
    this.cancelIdle();
    this.clearEmote();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.label.destroy();
  }
}
