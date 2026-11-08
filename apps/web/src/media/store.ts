import { create } from 'zustand';
import type { LocalAudioTrack, LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { loadPrefs, savePrefs, type MediaPrefs } from './prefs.js';

/** Lo que mostramos de cada persona cercana (a la que estamos suscritos). */
export interface PeerMedia {
  id: string;
  name: string;
  /** 0–1 según la distancia. */
  volume: number;
  camera: RemoteVideoTrack | null;
  screen: RemoteVideoTrack | null;
  micMuted: boolean;
  speaking: boolean;
}

export type MediaStatus = 'off' | 'connecting' | 'connected' | 'error';

interface MediaState {
  prefs: MediaPrefs;
  /** Pistas de la pantalla previa. Al entrar al mundo pasan a la sesión de LiveKit. */
  preview: { camera: LocalVideoTrack | null; microphone: LocalAudioTrack | null };
  previewErrors: { camera: string | null; microphone: string | null };

  status: MediaStatus;
  error: string | null;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  selfSpeaking: boolean;
  localCamera: LocalVideoTrack | null;
  localScreen: LocalVideoTrack | null;
  peers: Record<string, PeerMedia>;
  /** Nombre de la zona privada en la que estamos, o null en el espacio abierto. */
  zone: string | null;

  setPrefs: (patch: Partial<MediaPrefs>) => void;
  /** Entrega las pistas de la vista previa a quien las va a publicar (y deja de ser su dueño). */
  takePreview: () => MediaState['preview'];
}

export const useMedia = create<MediaState>((set, get) => ({
  prefs: loadPrefs(),
  preview: { camera: null, microphone: null },
  previewErrors: { camera: null, microphone: null },

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

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    savePrefs(prefs);
    set({ prefs });
  },

  takePreview: () => {
    const { preview } = get();
    set({ preview: { camera: null, microphone: null } });
    return preview;
  },
}));
