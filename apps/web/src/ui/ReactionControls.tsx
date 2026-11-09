import { useState } from 'react';
import { EMOTES, EMOTE_IDS, HAND_EMOJI } from '@pixels/shared';
import { sendEmote, toggleHand, useReactions } from '../reactions/store.js';
import { useApp } from '../store.js';
import { SmileIcon } from './icons.js';

/** Reacciones rápidas (también con las teclas 1–6) y levantar la mano (H). */
export function ReactionControls() {
  const room = useApp((s) => s.room);
  const handRaised = useReactions((s) => s.handRaised);
  const [open, setOpen] = useState(false);
  if (!room) return null;

  const handLabel = handRaised ? 'Bajar la mano (H)' : 'Levantar la mano (H)';
  return (
    <div className="reaction-controls">
      {open && (
        <div className="emote-picker" role="group" aria-label="Elegir reacción">
          {EMOTE_IDS.map((id, i) => (
            <button
              key={id}
              type="button"
              className="emote-button"
              aria-label={EMOTES[id].label}
              title={`${EMOTES[id].label} (${i + 1})`}
              onClick={() => {
                sendEmote(room, id);
                setOpen(false);
              }}
            >
              {EMOTES[id].emoji}
            </button>
          ))}
        </div>
      )}
      <div className="media-controls" role="toolbar" aria-label="Reacciones">
        <button
          type="button"
          className={`icon-button${open ? ' active' : ''}`}
          aria-expanded={open}
          aria-label="Reaccionar"
          title="Reaccionar (1–6)"
          onClick={() => setOpen((o) => !o)}
        >
          <SmileIcon />
        </button>
        <button
          type="button"
          className={`icon-button emoji-icon${handRaised ? ' active' : ''}`}
          aria-pressed={handRaised}
          aria-label={handRaised ? 'Bajar la mano' : 'Levantar la mano'}
          title={handLabel}
          onClick={() => toggleHand(room)}
        >
          {HAND_EMOJI}
        </button>
      </div>
    </div>
  );
}
