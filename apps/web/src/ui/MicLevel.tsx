import { useEffect, useRef } from 'react';
import type { LocalAudioTrack } from 'livekit-client';

/** Barra que se mueve con el volumen del micrófono (para comprobar que funciona). */
export function MicLevel({ track }: { track: LocalAudioTrack }) {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, (peak / 128) * 2.5)})`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void ctx.close();
    };
  }, [track]);

  return (
    <span className="mic-level" aria-hidden>
      <span ref={bar} />
    </span>
  );
}
