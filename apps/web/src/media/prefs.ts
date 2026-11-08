/** Preferencias de cámara y micrófono que se recuerdan entre visitas. */
export interface MediaPrefs {
  camera: boolean;
  microphone: boolean;
  cameraId: string | null;
  microphoneId: string | null;
}

const STORAGE_KEY = 'pixels.media';
const DEFAULTS: MediaPrefs = { camera: true, microphone: true, cameraId: null, microphoneId: null };

export function loadPrefs(): MediaPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const id = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return {
      camera: typeof saved.camera === 'boolean' ? saved.camera : DEFAULTS.camera,
      microphone: typeof saved.microphone === 'boolean' ? saved.microphone : DEFAULTS.microphone,
      cameraId: id(saved.cameraId),
      microphoneId: id(saved.microphoneId),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: MediaPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada.
  }
}

export type DeviceKind = 'camera' | 'microphone';

const ERRORS: Record<DeviceKind, Record<'denied' | 'missing' | 'busy' | 'other', string>> = {
  camera: {
    denied: 'El navegador no dio permiso para usar la cámara.',
    missing: 'No se encontró ninguna cámara.',
    busy: 'La cámara está en uso por otra aplicación.',
    other: 'No se pudo abrir la cámara.',
  },
  microphone: {
    denied: 'El navegador no dio permiso para usar el micrófono.',
    missing: 'No se encontró ningún micrófono.',
    busy: 'El micrófono está en uso por otra aplicación.',
    other: 'No se pudo abrir el micrófono.',
  },
};

/** Mensaje claro para el usuario a partir de un error de getUserMedia. */
export function describeMediaError(err: unknown, kind: DeviceKind): string {
  const name = err instanceof Error ? err.name : '';
  const texts = ERRORS[kind];
  if (name === 'NotAllowedError' || name === 'SecurityError') return texts.denied;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return texts.missing;
  if (name === 'NotReadableError') return texts.busy;
  return texts.other;
}
