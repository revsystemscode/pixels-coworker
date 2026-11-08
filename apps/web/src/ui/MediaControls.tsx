import { useState } from 'react';
import { useDeviceList } from '../media/devices.js';
import { useMedia } from '../media/store.js';
import { useApp } from '../store.js';
import { CameraIcon, MicIcon, ScreenIcon, SettingsIcon } from './icons.js';
import { DeviceSelect } from './MediaSetup.js';

const canShareScreen =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
const canPickSpeaker =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Barra inferior: micrófono, cámara, compartir pantalla y dispositivos. */
export function MediaControls() {
  const media = useApp((s) => s.media);
  const status = useMedia((s) => s.status);
  const error = useMedia((s) => s.error);
  const micOn = useMedia((s) => s.micOn);
  const cameraOn = useMedia((s) => s.cameraOn);
  const screenOn = useMedia((s) => s.screenOn);
  const audioBlocked = useMedia((s) => s.audioBlocked);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const ready = status === 'connected' && media !== null && !busy;
  const act = (fn: () => Promise<void>) => {
    useMedia.setState({ error: null });
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  return (
    <div className="media-bar">
      {status === 'connecting' && <p className="media-note">Conectando video…</p>}
      {error && (
        <p className="media-note error" role="alert">
          {error}
          <button
            type="button"
            className="link-button"
            onClick={() => useMedia.setState({ error: null })}
          >
            Cerrar
          </button>
        </p>
      )}
      {screenOn && media && (
        <p className="media-note" role="status">
          Compartes tu pantalla con quien está cerca.
          <button
            type="button"
            className="link-button"
            onClick={() => act(() => media.setScreenShare(false))}
          >
            Dejar de compartir
          </button>
        </p>
      )}
      {audioBlocked && media && (
        <button type="button" onClick={() => void media.startAudio()}>
          Activar audio
        </button>
      )}

      {settingsOpen && media && <DeviceSettings onClose={() => setSettingsOpen(false)} />}

      <div className="media-controls" role="toolbar" aria-label="Controles de video">
        <button
          type="button"
          className={`icon-button${micOn ? '' : ' off'}`}
          aria-pressed={micOn}
          aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
          title={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
          disabled={!ready}
          onClick={() => act(() => media!.setMicrophone(!micOn))}
        >
          <MicIcon off={!micOn} />
        </button>
        <button
          type="button"
          className={`icon-button${cameraOn ? '' : ' off'}`}
          aria-pressed={cameraOn}
          aria-label={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
          title={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
          disabled={!ready}
          onClick={() => act(() => media!.setCamera(!cameraOn))}
        >
          <CameraIcon off={!cameraOn} />
        </button>
        {canShareScreen && (
          <button
            type="button"
            className={`icon-button${screenOn ? ' active' : ''}`}
            aria-pressed={screenOn}
            aria-label={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
            title={screenOn ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
            disabled={!ready}
            onClick={() => act(() => media!.setScreenShare(!screenOn))}
          >
            <ScreenIcon />
          </button>
        )}
        <button
          type="button"
          className={`icon-button${settingsOpen ? ' active' : ''}`}
          aria-expanded={settingsOpen}
          aria-label="Elegir dispositivos"
          title="Elegir dispositivos"
          disabled={status !== 'connected'}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}

function DeviceSettings({ onClose }: { onClose: () => void }) {
  const media = useApp((s) => s.media);
  const prefs = useMedia((s) => s.prefs);
  const setPrefs = useMedia((s) => s.setPrefs);
  const localCamera = useMedia((s) => s.localCamera);
  const micOn = useMedia((s) => s.micOn);
  const cameras = useDeviceList('videoinput', localCamera);
  const microphones = useDeviceList('audioinput', micOn);
  const speakers = useDeviceList('audiooutput', micOn);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  if (!media) return null;

  const active = (kind: MediaDeviceKind) => media.livekit.getActiveDevice(kind) ?? null;

  return (
    <div className="panel device-settings" role="dialog" aria-label="Dispositivos">
      <DeviceSelect
        label="Cámara"
        devices={cameras}
        value={active('videoinput') ?? prefs.cameraId}
        onChange={(cameraId) => {
          setPrefs({ cameraId });
          void media.switchDevice('videoinput', cameraId);
        }}
      />
      <DeviceSelect
        label="Micrófono"
        devices={microphones}
        value={active('audioinput') ?? prefs.microphoneId}
        onChange={(microphoneId) => {
          setPrefs({ microphoneId });
          void media.switchDevice('audioinput', microphoneId);
        }}
      />
      {canPickSpeaker && (
        <DeviceSelect
          label="Altavoz"
          devices={speakers}
          value={speakerId ?? active('audiooutput')}
          onChange={(id) => {
            setSpeakerId(id);
            void media.switchDevice('audiooutput', id);
          }}
        />
      )}
      <button type="button" className="secondary" onClick={onClose}>
        Listo
      </button>
    </div>
  );
}
