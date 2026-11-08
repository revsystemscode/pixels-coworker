import { useEffect } from 'react';
import type { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import { describeMediaError, type DeviceKind } from './prefs.js';
import { useMedia } from './store.js';
import { openCamera, openMicrophone } from './tracks.js';

/**
 * Abre la cámara y el micrófono de la pantalla previa según las preferencias. Si la pista ya se
 * entregó a la sesión (takePreview), no la cierra al desmontar.
 */
export function usePreviewTracks() {
  const camera = useMedia((s) => s.prefs.camera);
  const cameraId = useMedia((s) => s.prefs.cameraId);
  const microphone = useMedia((s) => s.prefs.microphone);
  const microphoneId = useMedia((s) => s.prefs.microphoneId);

  useEffect(() => openPreview('camera', camera, () => openCamera(cameraId)), [camera, cameraId]);
  useEffect(
    () => openPreview('microphone', microphone, () => openMicrophone(microphoneId)),
    [microphone, microphoneId],
  );
}

function openPreview(
  kind: DeviceKind,
  enabled: boolean,
  open: () => Promise<LocalVideoTrack | LocalAudioTrack>,
) {
  const store = useMedia;
  const setTrack = (track: LocalVideoTrack | LocalAudioTrack | null) =>
    store.setState((s) => ({ preview: { ...s.preview, [kind]: track } }));
  const setError = (error: string | null) =>
    store.setState((s) => ({ previewErrors: { ...s.previewErrors, [kind]: error } }));

  // Al apagarlo se mantiene el último error visible (explica por qué se apagó).
  if (!enabled) return;

  let cancelled = false;
  let track: LocalVideoTrack | LocalAudioTrack | null = null;
  open()
    .then((t) => {
      if (cancelled) return t.stop();
      track = t;
      setError(null);
      setTrack(t);
    })
    .catch((err: unknown) => {
      if (cancelled) return;
      setError(describeMediaError(err, kind));
      store.getState().setPrefs({ [kind]: false });
    });

  return () => {
    cancelled = true;
    // Solo se cierra si sigue siendo nuestra (no se entregó a la sesión de LiveKit).
    if (track && store.getState().preview[kind] === track) {
      track.stop();
      setTrack(null);
    }
  };
}
