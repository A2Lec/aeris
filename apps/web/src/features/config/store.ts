import { create } from 'zustand';
import type { ConstraintKind, Environment, PolygonGeom } from '@aeris/shared';
import type { Place } from './place';

export type ConfigDrawMode =
  'idle' | 'workArea' | 'setupWorkArea' | 'priority' | 'constraint' | 'resourceArea';

/** Fenêtres successives de la planification (voir ConfigPanel). */
export const WIZARD_STEPS = [
  'Nom et lieu',
  'Zone d’intervention',
  'Zones interdites',
  'Zones urbaines',
  'Zones prioritaires',
  'Phases',
] as const;
export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

interface ConfigEditorStore {
  /** Fenêtre affichée ; absente = déduite de l'état de la mission. */
  step?: WizardStep;
  /** Lieu choisi pour centrer la carte avant de dessiner. */
  setupPlace?: Place;
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
  /** Drones voulus simultanément sur la prochaine zone prioritaire tracée. */
  priorityRedundancy: number;
  constraintKind: ConstraintKind;
  resourceId: string;
  setStep: (step?: WizardStep) => void;
  setSetupPlace: (place?: Place) => void;
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
  setPriorityRedundancy: (count: number) => void;
  setConstraintKind: (kind: ConstraintKind) => void;
  setResourceId: (id: string) => void;
}

export const useConfigEditorStore = create<ConfigEditorStore>((set) => ({
  drawMode: 'idle',
  editing: false,
  setupName: '',
  setupEnvironment: 'rural',
  setupMaxDrones: 4,
  setupPhaseCount: 1,
  setupGridCellM: 100,
  setupWorkArea: undefined,
  zoneName: '',
  priorityLevel: 1,
  priorityRedundancy: 1,
  constraintKind: 'interdite',
  resourceId: '',
  setStep: (step) => set({ step, drawMode: 'idle', editing: false, zoneName: '' }),
  setSetupPlace: (setupPlace) => set({ setupPlace }),
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
  setPriorityRedundancy: (priorityRedundancy) => set({ priorityRedundancy }),
  setConstraintKind: (constraintKind) => set({ constraintKind }),
  setResourceId: (resourceId) => set({ resourceId }),
}));

/** Remet l'assistant à zéro (nouvelle planification, retour à l'accueil). */
export function resetConfigEditor() {
  useConfigEditorStore.setState({
    step: undefined,
    setupPlace: undefined,
    setupName: '',
    setupWorkArea: undefined,
    drawMode: 'idle',
    editing: false,
    zoneName: '',
  });
}
