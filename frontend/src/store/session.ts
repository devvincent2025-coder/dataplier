import { create } from "zustand";

import { authApi, type SessionEnvelope, type UserSession } from "../lib/api";

const TOKEN_STORAGE_KEY = "dataplier.session.token";

type SessionState = {
  token: string | null;
  user: UserSession | null;
  isLoading: boolean;
  initialized: boolean;
  setSession: (session: SessionEnvelope) => void;
  setUser: (user: UserSession) => void;
  restoreSession: () => Promise<void>;
  clearSession: () => void;
  logout: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  isLoading: false,
  initialized: false,
  setSession: (session) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
    set({ token: session.token, user: session.user, initialized: true, isLoading: false });
  },
  setUser: (user) => {
    set({ user });
  },
  restoreSession: async () => {
    // For static deployment, skip session restoration to avoid API calls
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    set({ token: token || null, user: null, initialized: true, isLoading: false });
    
    /* Original API call - disabled for static deployment
    if (!token) {
      set({ token: null, user: null, initialized: true, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const result = await authApi.session(token);
      set({ token, user: result.user, initialized: true, isLoading: false });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ token: null, user: null, initialized: true, isLoading: false });
    }
    */
  },
  clearSession: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, user: null, initialized: true, isLoading: false });
  },
  logout: async () => {
    // For static deployment, just clear session locally
    get().clearSession();
    
    /* Original API call - disabled for static deployment
    const token = get().token;
    if (token) {
      try {
        await authApi.logout(token);
      } catch {
        // Ignore logout errors
      }
    }
    get().clearSession();
    */
  }
}));
