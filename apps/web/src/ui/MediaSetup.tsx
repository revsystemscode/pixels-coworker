import { useDeviceList } from '../media/devices.js';
import type { DeviceKind } from '../media/prefs.js';
import { useMedia } from '../media/store.js';
import { usePreviewTracks } from '../media/usePreviewTracks.js';
import { CameraIcon, MicIcon } from './icons.js';
import { MicLevel } from './MicLevel.js';
import { VideoView } from './VideoView.js';

/** Vista previa de cámara y micrófono antes de entrar. Se puede entrar sin ellos. */
export function MediaSetup() {
  usePreviewTracks();
  const prefs = useMedia((s) => s.prefs);
  const preview = useMedia((s) => s.preview);
  const errors = useMedia((s) => s.previewErrors);
  const setPrefs = useMedia((s) => s.setPrefs);

  const cameras = useDeviceList('videoinput', preview.camera);
  const microphones = useDeviceList('audioinput', preview.microphone);

  const toggle = (kind: DeviceKind) => {
    useMedia.setState((s) => ({ previewErrors: { ...s.previewErrors, [kind]: null } }));
    setPrefs({ [kind]: !prefs[kind] });
  };

  return (
    <section className="media-setup" aria-label="Cámara y micrófono">
      <div className="preview">
        {preview.camera ? (
          <VideoView track={preview.camera} mirror label="Vista previa de tu cámara" />
        ) : (
          <span className="preview-off">
            {prefs.camera ? 'Abriendo cámara…' : 'Cámara apagada'}
          </span>
        )}
        <div className="preview-toggles">
          <button
            type="button"
            className={`icon-button${prefs.microphone ? '' : ' off'}`}
            aria-pressed={prefs.microphone}
            aria-label={prefs.microphone ? 'Apagar micrófono' : 'Encender micrófono'}
            onClick={() => toggle('microphone')}
          >
            <MicIcon off={!prefs.microphone} />
          </button>
          <button
            type="button"
            className={`icon-button${prefs.camera ? '' : ' off'}`}
            aria-pressed={prefs.camera}
            aria-label={prefs.camera ? 'Apagar cámara' : 'Encender cámara'}
            onClick={() => toggle('camera')}
          >
            <CameraIcon off={!prefs.camera} />
          </button>
        </div>
        {preview.microphone && <MicLevel track={preview.microphone} />}
      </div>

      {(cameras.length > 1 || microphones.length > 1) && (
        <div className="device-selects">
          <DeviceSelect
            label="Cámara"
            devices={cameras}
            value={preview.camera?.mediaStreamTrack.getSettings().deviceId ?? prefs.cameraId}
            onChange={(cameraId) => setPrefs({ cameraId, camera: true })}
          />
          <DeviceSelect
            label="Micrófono"
            devices={microphones}
            value={
              preview.microphone?.mediaStreamTrack.getSettings().deviceId ?? prefs.microphoneId
            }
            onChange={(microphoneId) => setPrefs({ microphoneId, microphone: true })}
          />
        </div>
      )}

      {[errors.camera, errors.microphone].filter(Boolean).map((e) => (
        <p key={e} className="error" role="alert">
          {e} Puedes entrar igualmente.
        </p>
      ))}
    </section>
  );
}

export function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null | undefined;
  onChange: (deviceId: string) => void;
}) {
  if (devices.length === 0) return null;
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">Predeterminado</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
