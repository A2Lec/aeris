import { create } from 'zustand';
import type { LiveState } from '@aeris/shared';

interface LiveStore {
  live?: LiveState;
  connected: boolean;
  /** Panneau droit : dispositif en place ou recalcul proposé. */
  view: 'current' | 'pending';
  /** Niveau de la zone prioritaire à placer d'un clic sur la carte (aucun = mode inactif). */
  zoneLevel?: 1 | 2 | 3;
  setLive: (live: LiveState) => void;
  setConnected: (connected: boolean) => void;
  setView: (view: 'current' | 'pending') => void;
  setZoneLevel: (level?: 1 | 2 | 3) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  connected: false,
  view: 'current',
  setLive: (live) => set({ live }),
  setConnected: (connected) => set({ connected }),
  setView: (view) => set({ view }),
  setZoneLevel: (zoneLevel) => set({ zoneLevel }),
}));
