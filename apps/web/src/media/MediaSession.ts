import type { Room as GameRoom } from '@colyseus/sdk';
import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import {
  audiblePeers,
  zoneAt,
  type MediaTokenResponse,
  type Point,
  type WorldMap,
} from '@pixels/shared';
import { env } from '../env.js';
import { ProximityTracker, sameKeys } from './proximity.js';
import { useMedia, type PeerMedia } from './store.js';

/** Cada cuánto se recalcula quién está cerca (las posiciones llegan a 15 Hz). */
const PROXIMITY_INTERVAL_MS = 150;

interface PlayerView extends Point {
  name: string;
}

/**
 * Video y audio por proximidad con LiveKit.
 *
 * - Cada cliente publica su cámara y su micrófono, pero solo deja suscribirse a quien tiene cerca
 *   (permisos de pista de LiveKit, que aplica el servidor de LiveKit). Un cliente modificado no
 *   puede recibir el video ni el audio de quien está lejos.
 * - Cada cliente se suscribe solo a quien tiene cerca y ajusta el volumen según la distancia.
 * - Las dos decisiones se calculan con las mismas posiciones (las del servidor de juego) y la misma
 *   regla (`hearingVolume` de @pixels/shared), así que coinciden en ambos lados.
 */
export class MediaSession {
  readonly livekit = new Room({ adaptiveStream: true, dynacast: true });
  private tracker = new ProximityTracker();
  /** Con quién estamos conectados ahora: id → volumen (0 = saliendo del radio). */
  private connected = new Map<string, number>();
  private allowed = new Map<string, number>();
  private timer: number | undefined;
  private audioElements = new Map<string, HTMLMediaElement[]>();
  private stopped = false;

  constructor(
    private readonly game: GameRoom,
    private readonly world: WorldMap,
    private readonly ticket: Promise<string>,
  ) {}

  async start(preview: { camera: LocalVideoTrack | null; microphone: LocalAudioTrack | null }) {
    useMedia.setState({ status: 'connecting', error: null });
    try {
      const { url, token } = await this.fetchToken(await this.ticket);
      if (this.stopped) throw new Error('stopped');
      this.bindEvents();
      await this.livekit.connect(url, token, { autoSubscribe: false });
      if (this.stopped) throw new Error('stopped');

      // Nadie puede suscribirse a nuestras pistas hasta que esté cerca.
      this.livekit.localParticipant.setTrackSubscriptionPermissions(false, []);
      // (Conversión: los tipos de livekit-client no encajan con exactOptionalPropertyTypes.)
      for (const track of [preview.microphone, preview.camera])
        if (track) await this.livekit.localParticipant.publishTrack(track as unknown as LocalTrack);

      useMedia.setState({ status: 'connected' });
      this.syncLocal();
      this.timer = window.setInterval(() => this.updateProximity(), PROXIMITY_INTERVAL_MS);
      this.updateProximity();
    } catch (err) {
      preview.camera?.stop();
      preview.microphone?.stop();
      if (this.stopped) return;
      console.warn('[media] no se pudo conectar', err);
      useMedia.setState({
        status: 'error',
        error: 'No se pudo conectar el video. Puedes seguir usando el chat.',
      });
    }
  }

  async stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    for (const els of this.audioElements.values()) els.forEach((el) => el.remove());
    this.audioElements.clear();
    await this.livekit.disconnect(true);
    useMedia.setState({
      status: 'off',
      error: null,
      micOn: false,
      cameraOn: false,
      screenOn: false,
      selfSpeaking: false,
      localCamera: null,
      localScreen: null,
      peers: {},
      zone: null,
    });
  }

  // --- Controles ---

  async setMicrophone(on: boolean) {
    await this.run(() => this.livekit.localParticipant.setMicrophoneEnabled(on), 'microphone');
  }

  async setCamera(on: boolean) {
    await this.run(() => this.livekit.localParticipant.setCameraEnabled(on), 'camera');
  }

  async setScreenShare(on: boolean) {
    await this.run(
      () => this.livekit.localParticipant.setScreenShareEnabled(on, { audio: true }),
      'screen',
    );
  }

  async switchDevice(kind: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string) {
    await this.livekit.switchActiveDevice(kind, deviceId);
  }

  /** Reanuda el audio si el navegador lo bloqueó (necesita un clic del usuario). */
  async startAudio() {
    await this.livekit.startAudio();
    useMedia.setState({ audioBlocked: !this.livekit.canPlaybackAudio });
  }

  private async run(action: () => Promise<unknown>, what: 'microphone' | 'camera' | 'screen') {
    try {
      await action();
    } catch (err) {
      // Cancelar el selector de pantalla no es un error.
      if (what === 'screen' && err instanceof Error && err.name === 'NotAllowedError') return;
      console.warn(`[media] ${what}`, err);
      const text = {
        microphone: 'No se pudo usar el micrófono.',
        camera: 'No se pudo usar la cámara.',
        screen: 'No se pudo compartir la pantalla.',
      }[what];
      useMedia.setState({ error: text });
    } finally {
      this.syncLocal();
    }
  }

  // --- Conexión ---

  private async fetchToken(ticket: string): Promise<MediaTokenResponse> {
    const res = await fetch(`${env.apiUrl}/media/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
    return (await res.json()) as MediaTokenResponse;
  }

  private bindEvents() {
    const lk = this.livekit;
    const refresh = () => this.syncPeers();

    lk.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) this.attachAudio(track, participant);
      refresh();
    })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.detachAudio(track);
        refresh();
      })
      .on(RoomEvent.TrackPublished, (pub, participant) => {
        this.applySubscription(participant, pub);
        refresh();
      })
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.applyParticipant(participant);
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        useMedia.setState({ selfSpeaking: speakers.some((p) => p === lk.localParticipant) });
        refresh();
      })
      .on(RoomEvent.LocalTrackPublished, () => this.syncLocal())
      .on(RoomEvent.LocalTrackUnpublished, () => this.syncLocal())
      .on(RoomEvent.AudioPlaybackStatusChanged, () =>
        useMedia.setState({ audioBlocked: !lk.canPlaybackAudio }),
      )
      .on(RoomEvent.Reconnecting, () => useMedia.setState({ status: 'connecting' }))
      .on(RoomEvent.Reconnected, () => useMedia.setState({ status: 'connected' }))
      .on(RoomEvent.Disconnected, () => {
        if (this.stopped) return;
        window.clearInterval(this.timer);
        useMedia.setState({
          status: 'error',
          error: 'Se perdió la conexión de video. Sal y vuelve a entrar para recuperarla.',
          peers: {},
        });
      });
  }

  // --- Proximidad ---

  private players(): Map<string, PlayerView> {
    const result = new Map<string, PlayerView>();
    const players = this.game.state?.players as
      { forEach: (cb: (p: PlayerView, id: string) => void) => void } | undefined;
    players?.forEach((p, id) => result.set(id, { x: p.x, y: p.y, name: p.name }));
    return result;
  }

  private updateProximity() {
    const players = this.players();
    const self = players.get(this.game.sessionId);
    if (!self) return;
    players.delete(this.game.sessionId);

    const zone = zoneAt(this.world, self)?.name ?? null;
    if (useMedia.getState().zone !== zone) useMedia.setState({ zone });

    const audible = audiblePeers(this.world, self, players);
    const next = this.tracker.update(audible, performance.now());
    for (const id of this.connected.keys())
      if (!players.has(id) && !next.has(id)) this.tracker.forget(id);

    const changedPeers = !sameKeys(next, this.connected);
    this.connected = next;

    // Permisos: quién puede recibir nuestras pistas. Lo aplica el servidor de LiveKit.
    if (!sameKeys(next, this.allowed)) {
      this.allowed = new Map(next);
      this.livekit.localParticipant.setTrackSubscriptionPermissions(
        false,
        [...next.keys()].map((participantIdentity) => ({ participantIdentity, allowAll: true })),
      );
    }

    for (const participant of this.livekit.remoteParticipants.values())
      this.applyParticipant(participant);

    if (changedPeers || this.volumesChanged()) this.syncPeers();
  }

  private applyParticipant(participant: RemoteParticipant) {
    for (const pub of participant.trackPublications.values())
      this.applySubscription(participant, pub);
    const volume = this.connected.get(participant.identity) ?? 0;
    participant.setVolume(volume, Track.Source.Microphone);
    participant.setVolume(volume, Track.Source.ScreenShareAudio);
  }

  private applySubscription(participant: RemoteParticipant, pub: RemoteTrackPublication) {
    const want = this.connected.has(participant.identity);
    if (pub.isDesired !== want) pub.setSubscribed(want);
    // Durante el margen de salida no hace falta recibir video.
    if (want && pub.kind === Track.Kind.Video) {
      const visible = (this.connected.get(participant.identity) ?? 0) > 0;
      if (pub.isEnabled !== visible) pub.setEnabled(visible);
    }
  }

  private lastVolumes = new Map<string, number>();
  private volumesChanged() {
    let changed = this.lastVolumes.size !== this.connected.size;
    for (const [id, v] of this.connected) if (this.lastVolumes.get(id) !== v) changed = true;
    if (changed) this.lastVolumes = new Map(this.connected);
    return changed;
  }

  // --- Audio ---

  private attachAudio(track: RemoteTrack, participant: RemoteParticipant) {
    const el = track.attach();
    el.dataset.participant = participant.identity;
    el.style.display = 'none';
    document.body.append(el);
    const key = track.sid ?? participant.identity;
    this.audioElements.set(key, [...(this.audioElements.get(key) ?? []), el]);
    // Al adjuntar, LiveKit pone el volumen a 1: hay que volver a aplicar el de la distancia.
    this.applyParticipant(participant);
  }

  private detachAudio(track: RemoteTrack) {
    track.detach().forEach((el) => el.remove());
    if (track.sid) this.audioElements.delete(track.sid);
  }

  // --- Estado para la interfaz ---

  private syncLocal() {
    const local = this.livekit.localParticipant;
    const mic = local.getTrackPublication(Track.Source.Microphone);
    const cam = local.getTrackPublication(Track.Source.Camera);
    const screen = local.getTrackPublication(Track.Source.ScreenShare);
    useMedia.setState({
      micOn: !!mic && !mic.isMuted,
      cameraOn: !!cam && !cam.isMuted,
      screenOn: !!screen,
      localCamera: cam && !cam.isMuted ? (cam.videoTrack ?? null) : null,
      localScreen: screen?.videoTrack ?? null,
    });
  }

  private syncPeers() {
    const players = this.players();
    const peers: Record<string, PeerMedia> = {};
    for (const [id, volume] of this.connected) {
      if (volume <= 0) continue;
      const participant = this.livekit.remoteParticipants.get(id);
      const player = players.get(id);
      if (!player) continue;
      const cam = participant?.getTrackPublication(Track.Source.Camera);
      const screen = participant?.getTrackPublication(Track.Source.ScreenShare);
      const mic = participant?.getTrackPublication(Track.Source.Microphone);
      peers[id] = {
        id,
        name: player.name,
        volume,
        camera: cam?.isSubscribed && !cam.isMuted ? (cam.videoTrack ?? null) : null,
        screen: screen?.isSubscribed ? (screen.videoTrack ?? null) : null,
        micMuted: !mic || mic.isMuted,
        speaking: participant?.isSpeaking ?? false,
      };
    }
    useMedia.setState({ peers });
  }

  /** Datos para pruebas E2E. */
  debugSnapshot() {
    const remote = [...this.livekit.remoteParticipants.values()].map((p) => ({
      id: p.identity,
      subscribed: [...p.trackPublications.values()]
        .filter((pub) => pub.isSubscribed)
        .map((pub) => pub.source),
      volume: this.connected.get(p.identity) ?? 0,
    }));
    return {
      status: useMedia.getState().status,
      zone: useMedia.getState().zone,
      allowed: [...this.allowed.keys()],
      remote,
    };
  }
}
