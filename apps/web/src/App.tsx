import { useApp } from './store.js';
import { JoinScreen } from './ui/JoinScreen.js';
import { WorldScreen } from './ui/WorldScreen.js';

export function App() {
  const phase = useApp((s) => s.phase);
  const room = useApp((s) => s.room);
  return phase === 'world' && room ? <WorldScreen room={room} /> : <JoinScreen />;
}
