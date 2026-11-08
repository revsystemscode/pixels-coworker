import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Track } from 'livekit-client';
import { useMedia } from '../media/store.js';
import { layoutBubbles } from './bubbleLayout.js';
import { MicIcon } from './icons.js';
import { VideoView } from './VideoView.js';

const SIZE = { width: 112, height: 84, gap: 8, margin: 8 };

interface BubbleItem {
  id: string;
  name: string;
  camera: Track | null;
  micMuted: boolean;
  speaking: boolean;
  volume: number;
  self: boolean;
}

/**
 * Burbujas de video sobre los avatares de quienes están cerca (y la propia). Se reposicionan en
 * cada fotograma sin pasar por React.
 */
export function VideoBubbles({
  selfId,
  selfName,
  getPositions,
}: {
  selfId: string;
  selfName: string;
  getPositions: () => Map<string, { x: number; y: number }>;
}) {
  const peers = useMedia((s) => s.peers);
  const status = useMedia((s) => s.status);
  const localCamera = useMedia((s) => s.localCamera);
  const micOn = useMedia((s) => s.micOn);
  const selfSpeaking = useMedia((s) => s.selfSpeaking);

  const items: BubbleItem[] = Object.values(peers).map((p) => ({ ...p, self: false }));
  // La propia burbuja solo aparece si hay alguien cerca: así se sabe qué ven los demás.
  if (status === 'connected' && items.length > 0) {
    items.unshift({
      id: selfId,
      name: selfName,
      camera: localCamera,
      micMuted: !micOn,
      speaking: selfSpeaking,
      volume: 1,
      self: true,
    });
  }

  const container = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const ids = useRef<string[]>([]);
  const idList = items.map((i) => i.id).join(',');
  useLayoutEffect(() => {
    ids.current = idList ? idList.split(',') : [];
  }, [idList]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const box = container.current?.getBoundingClientRect();
      if (!box || ids.current.length === 0) return;
      const positions = getPositions();
      const anchors = ids.current.flatMap((id) => {
        const p = positions.get(id);
        return p ? [{ id, ...p }] : [];
      });
      const layout = layoutBubbles(anchors, {
        ...SIZE,
        viewport: { width: box.width, height: box.height },
      });
      for (const { id, left, top } of layout) {
        const el = elements.current.get(id);
        if (el) {
          el.style.transform = `translate(${left}px, ${top}px)`;
          el.style.visibility = 'visible';
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [getPositions]);

  return (
    <div ref={container} className="bubbles" aria-label="Video de las personas cercanas">
      {items.map((item) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) elements.current.set(item.id, el);
            else elements.current.delete(item.id);
          }}
          className={`bubble${item.speaking ? ' speaking' : ''}${item.self ? ' self' : ''}`}
          style={{ width: SIZE.width, height: SIZE.height, opacity: 0.55 + 0.45 * item.volume }}
          data-peer={item.id}
        >
          {item.camera ? (
            <VideoView track={item.camera} mirror={item.self} label={`Video de ${item.name}`} />
          ) : (
            <span className="bubble-initial" aria-hidden>
              {item.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="bubble-name">
            {item.micMuted && (
              <span className="bubble-muted" title="Micrófono apagado">
                <MicIcon off />
              </span>
            )}
            {item.self ? 'Tú' : item.name}
          </span>
        </div>
      ))}
    </div>
  );
}
