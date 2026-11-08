import type { Room } from '@colyseus/sdk';
import { useApp } from '../store.js';
import { GameCanvas } from '../game/GameCanvas.js';
import { ChatPanel } from './ChatPanel.js';

export function WorldScreen({ room }: { room: Room }) {
  const leave = useApp((s) => s.leave);
  const selfName = useApp((s) => s.selfName);
  return (
    <div className="world">
      <GameCanvas room={room} selfName={selfName} />
      <header className="hud">
        <span className="hud-title">pixels-coworker</span>
        <button type="button" className="secondary" onClick={() => void leave()}>
          Salir
        </button>
      </header>
      <p className="hint">Muévete con las flechas, WASD o haciendo clic en el mapa.</p>
      <ChatPanel selfId={room.sessionId} />
    </div>
  );
}
