import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Room } from '@colyseus/sdk';
import type { TiledMap } from '@pixels/shared';
import { useApp } from '../store.js';
import { GameCanvas } from '../game/GameCanvas.js';
import { BoardOverlay, BoardPrompt } from '../whiteboard/BoardOverlay.js';
import { ChatPanel } from './ChatPanel.js';
import { MediaControls } from './MediaControls.js';
import { ScreenShares } from './ScreenShares.js';
import { SpacePanel } from './SpacePanel.js';
import { ZoneBadge } from './ZoneBadge.js';

export function WorldScreen({ room, map }: { room: Room; map: TiledMap }) {
  const navigate = useNavigate();
  const selfName = useApp((s) => s.selfName);
  const space = useApp((s) => s.space);
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <div className="world">
      <GameCanvas room={room} map={map} selfName={selfName} />
      <header className="hud">
        <span className="hud-title">{space?.name ?? 'pixels-coworker'}</span>
        <button type="button" className="secondary" onClick={() => setPanelOpen(true)}>
          Espacio
        </button>
        <button type="button" className="secondary" onClick={() => navigate('/')}>
          Salir
        </button>
        <ZoneBadge />
      </header>
      <ScreenShares />
      <MediaControls />
      <p className="hint">Muévete con las flechas, WASD o haciendo clic en el mapa.</p>
      <BoardPrompt room={room} />
      <ChatPanel selfId={room.sessionId} />
      <BoardOverlay selfId={room.sessionId} />
      {panelOpen && space && <SpacePanel space={space} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
