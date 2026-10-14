/**
 * Interfaces entre moteurs : chaque package implémente la sienne sans dépendre
 * de l'avancement des autres. Ne modifier qu'en accord avec toute l'équipe.
 *
 * Chaque implémentation est déclarée avec son type (`export const solve: Solver = …`)
 * et vérifiée par la suite de tests de contrat correspondante (@aeris/contracts).
 */
import type {
  Assignment,
  CoverageLayers,
  DroneModel,
  Metrics,
  Mission,
  PilotRule,
  Requirement,
  Resource,
  SolveStatus,
  Strategy,
  Weather,
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

// ─── Moteur géo (P3) ─────────────────────────────────────────────────────────

/** Discrétise la zone de travail pour une phase (zones prioritaires actives de cette phase). */
export type GridBuilder = (mission: Mission, phase: number) => Grid;

export interface MetricsOptions {
  /** Le couple peut-il servir cette cellule (capacités requises) ? Par défaut : oui. */
  canServe?: (resourceId: string, cell: Cell) => boolean;
}

/** Indicateurs d'une phase, pour les affectations de cette phase uniquement. */
export type MetricsEngine = (
  grid: Grid,
  assignments: Assignment[],
  opts?: MetricsOptions,
) => Metrics;

/** Géométries couverture / trous / chevauchement d'une phase, pour la carte. */
export type CoverageGeometryBuilder = (grid: Grid, assignments: Assignment[]) => CoverageLayers;

// ─── Solveur (P2) ────────────────────────────────────────────────────────────

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

// ─── Séparation (P4) ─────────────────────────────────────────────────────────

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

/** Tout ce dont la séparation peut avoir besoin pour une phase. */
export interface DeconflictContext {
  mission: Mission;
  catalog: DroneModel[];
  rules: PilotRule[];
  /** Grille de la phase : plafonds locaux (`cell.maxHeightM`), cellules urbaines. */
  grid: Grid;
  phase: number;
}

/** Reçoit les affectations d'UNE phase (sortie du solveur) et les rend séparées. */
export type Deconflicter = (assignments: Assignment[], ctx: DeconflictContext) => DeconflictResult;

// ─── Météo (P4) ──────────────────────────────────────────────────────────────

export type WeatherProvider = (lat: number, lng: number) => Promise<Weather>;

/** Couples à exclure du calcul à cause de la météo : { resourceId: raison lisible }. */
export type WeatherFilter = (
  resources: Resource[],
  catalog: DroneModel[],
  weather: Weather,
) => Record<string, string>;
