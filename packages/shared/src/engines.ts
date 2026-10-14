/**
 * Interfaces entre moteurs : chaque package implémente la sienne sans dépendre
 * de l'avancement des autres. Ne modifier qu'en accord avec toute l'équipe.
 */
import type {
  Assignment,
  DroneModel,
  Mission,
  PilotRule,
  Requirement,
  SolveStatus,
  Strategy,
} from './domain';

/** Cellule de la grille de calcul (une grille par phase). */
export interface Cell {
  /** = index dans grid.cells */
  id: number;
  row: number;
  col: number;
  center: [number, number];
  /** 0 = hors zone prioritaire, sinon niveau max des zones actives qui la contiennent. */
  priorityLevel: number;
  requires: Requirement;
  /** Zone interdite : ne peut pas être survolée. */
  forbidden: boolean;
  urban: boolean;
  /** Plafond local (zone hauteur_limitee). */
  maxHeightM?: number;
}

export interface Grid {
  phase: number;
  cellSizeM: number;
  cellAreaM2: number;
  rows: number;
  cols: number;
  cells: Cell[];
}

export interface SolveContext {
  mission: Mission;
  catalog: DroneModel[];
  rules: PilotRule[];
  grid: Grid;
  phase: number;
  strategy: Strategy;
  /** Couples exclus avant calcul (météo…), avec la raison. */
  excluded?: Record<string, string>;
  /** Solution courante : sert de point de départ et à pénaliser les déplacements. */
  previous?: Assignment[];
}

export interface SolveResult {
  status: SolveStatus;
  assignments: Assignment[];
  diagnostics: string[];
}

export type Solver = (ctx: SolveContext) => SolveResult | Promise<SolveResult>;

export type SeparationMethod = 'horizontal' | 'vertical' | 'temporel' | 'renoncement';

export interface Conflict {
  a: string;
  b: string;
  phase: number;
  resolvedBy?: SeparationMethod;
}

export interface DeconflictResult {
  assignments: Assignment[];
  conflicts: Conflict[];
  diagnostics: string[];
}
