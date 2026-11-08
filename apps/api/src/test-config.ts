// Configuración común de las pruebas (no se incluye en el build).
import type { MediaOptions } from './media.js';

export const testMedia: MediaOptions = {
  livekitPublicUrl: 'ws://livekit.test',
  livekitApiKey: 'test-key',
  livekitApiSecret: 'test-secret-that-is-long-enough-123',
  mediaTicketSecret: 'ticket-secret',
  now: () => 1_000,
};
