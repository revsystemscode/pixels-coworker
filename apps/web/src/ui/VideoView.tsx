import { useEffect, useRef } from 'react';
import type { Track } from 'livekit-client';

/** Muestra una pista de video de LiveKit (local o remota). */
export function VideoView({
  track,
  mirror = false,
  className,
  label,
}: {
  track: Track;
  mirror?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      className={`${className ?? ''}${mirror ? ' mirror' : ''}`}
      autoPlay
      playsInline
      muted
      aria-label={label}
    />
  );
}
