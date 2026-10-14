import { create } from 'zustand';
import type { ConstraintKind, Environment, PolygonGeom } from '@aeris/shared';

export type ConfigDrawMode =
  'idle' | 'workArea' | 'setupWorkArea' | 'priority' | 'constraint' | 'resourceArea';

interface ConfigEditorStore {
  drawMode: ConfigDrawMode;
  editing: boolean;
  setupName: string;
  setupEnvironment: Environment;
  setupMaxDrones: number;
  setupPhaseCount: number;
  setupGridCellM: number;
  setupWorkArea?: PolygonGeom;
  zoneName: string;
  priorityLevel: 1 | 2 | 3;
  constraintKind: ConstraintKind;
  resourceId: string;
  setSetupName: (name: string) => void;
  setSetupEnvironment: (environment: Environment) => void;
  setSetupMaxDrones: (count: number) => void;
  setSetupPhaseCount: (count: number) => void;
  setSetupGridCellM: (size: number) => void;
  setSetupWorkArea: (area?: PolygonGeom) => void;
  setDrawMode: (mode: ConfigDrawMode) => void;
  setEditing: (editing: boolean) => void;
  setZoneName: (name: string) => void;
  setPriorityLevel: (level: 1 | 2 | 3) => void;
  setConstraintKind: (kind: ConstraintKind) => void;
  setResourceId: (id: string) => void;
}

export const useConfigEditorStore = create<ConfigEditorStore>((set) => ({
  drawMode: 'idle',
  editing: false,
  setupName: '',
  setupEnvironment: 'rural',
  setupMaxDrones: 1,
  setupPhaseCount: 1,
  setupGridCellM: 100,
  setupWorkArea: undefined,
  zoneName: '',
  priorityLevel: 1,
  constraintKind: 'interdite',
  resourceId: '',
  setSetupName: (setupName) => set({ setupName }),
  setSetupEnvironment: (setupEnvironment) => set({ setupEnvironment }),
  setSetupMaxDrones: (setupMaxDrones) => set({ setupMaxDrones }),
  setSetupPhaseCount: (setupPhaseCount) => set({ setupPhaseCount }),
  setSetupGridCellM: (setupGridCellM) => set({ setupGridCellM }),
  setSetupWorkArea: (setupWorkArea) => set({ setupWorkArea }),
  setDrawMode: (drawMode) => set({ drawMode }),
  setEditing: (editing) => set({ editing }),
  setZoneName: (zoneName) => set({ zoneName }),
  setPriorityLevel: (priorityLevel) => set({ priorityLevel }),
  setConstraintKind: (constraintKind) => set({ constraintKind }),
  setResourceId: (resourceId) => set({ resourceId }),
}));
