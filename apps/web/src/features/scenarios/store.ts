import { create } from 'zustand';

interface ScenarioStore {
  selectedId?: string;
  phase: number;
  select: (id: string) => void;
  setPhase: (phase: number) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  phase: 0,
  select: (selectedId) => set({ selectedId }),
  setPhase: (phase) => set({ phase }),
}));
