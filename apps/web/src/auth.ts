import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';
import { create } from 'zustand';
import type { Me, ProfileUpdate } from '@pixels/shared';
import { ApiRequestError, api } from './api.js';
import { env } from './env.js';

export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [magicLinkClient()],
  fetchOptions: { credentials: 'include' },
});

/** URL absoluta de la web (el enlace del correo vuelve aquí). */
export const webUrl = (path: string) => new URL(path, window.location.origin).toString();

interface SessionState {
  /** undefined: cargando; null: sin sesión. */
  me: Me | null | undefined;
  load: () => Promise<void>;
  saveProfile: (profile: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  me: undefined,

  load: async () => {
    try {
      set({ me: await api<Me>('GET', '/me') });
    } catch (err) {
      // Sin sesión (401) o API caída: en los dos casos, a la pantalla de login.
      if (!(err instanceof ApiRequestError) || err.status === 401 || err.status === 0) {
        set({ me: null });
      } else throw err;
    }
  },

  saveProfile: async (profile) => {
    set({ me: await api<Me>('PATCH', '/me', profile) });
  },

  signOut: async () => {
    await authClient.signOut();
    set({ me: null });
  },
}));
