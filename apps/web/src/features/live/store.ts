import { create } from 'zustand';
import type { LiveState } from '@aeris/shared';

interface LiveStore {
  live?: LiveState;
  connected: boolean;
  setLive: (live: LiveState) => void;
  setConnected: (connected: boolean) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  connected: false,
  setLive: (live) => set({ live }),
  setConnected: (connected) => set({ connected }),
}));
