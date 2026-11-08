import { useEffect, useState } from 'react';

/**
 * Lista de dispositivos de un tipo. Los nombres solo aparecen después de dar permiso, así que
 * `refreshKey` permite recargarla cuando cambia algo (por ejemplo, al abrir la cámara).
 */
export function useDeviceList(kind: MediaDeviceKind, refreshKey?: unknown) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    let active = true;
    const load = () =>
      media
        .enumerateDevices()
        .then((list) => {
          if (active) setDevices(list.filter((d) => d.kind === kind && d.deviceId));
        })
        .catch(() => {});
    void load();
    media.addEventListener('devicechange', load);
    return () => {
      active = false;
      media.removeEventListener('devicechange', load);
    };
  }, [kind, refreshKey]);

  return devices;
}
