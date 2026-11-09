import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Track } from 'livekit-client';
import { HAND_EMOJI } from '@pixels/shared';
import { useMedia } from '../media/store.js';
import { useReactions } from '../reactions/store.js';
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
  const hands = useReactions((s) => s.hands);
  const emotes = useReactions((s) => s.emotes);

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
  const idList = items.map((i) => i.id).join(',');

  // Tamaño de la zona visible, sin medir el DOM en cada fotograma.
  const viewport = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      viewport.current = { width: el.clientWidth, height: el.clientHeight };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // El bucle solo corre mientras hay burbujas, y solo toca el DOM si algo se movió.
  useLayoutEffect(() => {
    if (!idList) return;
    const ids = idList.split(',');
    const last = new Map<string, string>();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const positions = getPositions();
      const anchors = ids.flatMap((id) => {
        const p = positions.get(id);
        return p ? [{ id, ...p }] : [];
      });
      for (const { id, left, top } of layoutBubbles(anchors, {
        ...SIZE,
        viewport: viewport.current,
      })) {
        const transform = `translate(${left}px, ${top}px)`;
        const el = elements.current.get(id);
        if (!el || last.get(id) === transform) continue;
        last.set(id, transform);
        el.style.transform = transform;
        el.style.visibility = 'visible';
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [idList, getPositions]);

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
          {emotes[item.id] && (
            <span key={emotes[item.id]!.key} className="bubble-emote" aria-hidden>
              {emotes[item.id]!.emoji}
            </span>
          )}
          <span className="bubble-name">
            {hands[item.id] && (
              <span className="bubble-hand" title="Mano levantada">
                {HAND_EMOJI}
              </span>
            )}
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
