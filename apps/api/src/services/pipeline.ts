import { randomUUID } from 'node:crypto';
import { communesDemo, drones, pilotRules } from '@aeris/data';
import {
  buildGrid,
  communesConcernees,
  computeMetrics,
  couchesParCouple,
  couvertureParZone,
  coverageGeometry,
  mesurerStabilite,
} from '@aeris/geo';
import { solve } from '@aeris/solver';
import { deconflict } from '@aeris/deconflict';
import { excludedByWeather, fetchWeather } from '@aeris/weather';
import {
  meetsRequirement,
  type Assignment,
  type Cell,
  type Grid,
  type Metrics,
  type Mission,
  type Proposal,
  type SolveStatus,
  type Strategy,
  type Weather,
} from '@aeris/shared';

export const STRATEGY_LABELS: Record<Strategy, string> = {
  couverture_globale: 'Couverture maximale',
  priorite: 'Zones prioritaires d’abord',
  economie_moyens: 'Économie de moyens',
};

const SEVERITY: Record<SolveStatus, number> = { optimal: 0, faisable: 1, infaisable: 2 };

export function canServeFor(mission: Mission) {
  const modelByRes = new Map(
    mission.resources.map((r) => [r.id, drones.find((d) => d.id === r.droneModelId)]),
  );
  return (resourceId: string, cell: Cell) => {
    const m = modelByRes.get(resourceId);
    return !!m && meetsRequirement(m, cell.requires);
  };
}

/**
 * Métriques complètes d'une phase : celles du moteur, plus ce qui demande la mission ou des
 * données externes (couverture par zone prioritaire, communes concernées).
 * Les communes ne sont connues qu'autour de la zone de démo (packages/data) : ailleurs, liste vide.
 */
function fullMetrics(mission: Mission, grid: Grid, assignments: Assignment[]): Metrics {
  const canServe = canServeFor(mission);
  return {
    ...computeMetrics(grid, assignments, { canServe }),
    communes: communesConcernees(grid, assignments, communesDemo),
    byZone: couvertureParZone(mission, grid, assignments, { canServe }),
  };
}

export function metricsFor(mission: Mission, phase: number, assignments: Assignment[]): Metrics {
  return fullMetrics(mission, buildGrid(mission, phase), assignments);
}

export interface BuildOptions {
  weather?: Weather;
  /** Solution courante (recalcul en conduite) : stabilité des positions. */
  previous?: Assignment[];
  /** Phases à calculer (défaut : toutes). */
  phases?: number[];
}

export function coverageFor(mission: Mission, phase: number, assignments: Assignment[]) {
  const grid = buildGrid(mission, phase);
  const ofPhase = assignments.filter((a) => a.phase === phase);
  return {
    ...coverageGeometry(grid, ofPhase, { canServe: canServeFor(mission) }),
    byResource: couchesParCouple(grid, ofPhase),
  };
}

/** Écart entre le dispositif en place et un recalcul, sur une phase. */
export function stabilityFor(
  mission: Mission,
  phase: number,
  before: Assignment[],
  after: Assignment[],
) {
  return mesurerStabilite(buildGrid(mission, phase), before, after, {
    canServe: canServeFor(mission),
  });
}

/** Grille → solveur → séparation → métriques, phase par phase. */
export async function buildProposal(
  mission: Mission,
  strategy: Strategy,
  opts: BuildOptions = {},
): Promise<Proposal> {
  const phases = opts.phases ?? [...Array(mission.phaseCount).keys()];
  // Une météo de repli n'est pas une mesure : on ne s'en sert pas pour écarter des drones.
  const realWeather = opts.weather?.source === 'repli' ? undefined : opts.weather;
  const excluded = realWeather ? excludedByWeather(mission.resources, drones, realWeather) : {};
  const assignments: Assignment[] = [];
  const metricsByPhase: Metrics[] = [];
  const diagnostics: string[] = [];
  let status: SolveStatus = 'optimal';
  let previous = opts.previous;
  if (opts.weather?.source === 'repli') {
    diagnostics.push(
      'Météo indisponible : calcul sans contrainte météo, à vérifier avant engagement',
    );
  }

  for (const phase of phases) {
    const grid = buildGrid(mission, phase);
    const res = await solve({
      mission,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase,
      strategy,
      excluded,
      previous,
    });
    const dc = deconflict(res.assignments, {
      mission,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase,
    });
    assignments.push(...dc.assignments);
    metricsByPhase.push(fullMetrics(mission, grid, dc.assignments));
    for (const d of [...res.diagnostics, ...dc.diagnostics])
      diagnostics.push(`Phase ${phase + 1} — ${d}`);
    if (SEVERITY[res.status] > SEVERITY[status]) status = res.status;
    // Phase suivante : on part de celle-ci pour limiter les déplacements.
    previous = dc.assignments;
  }

  return {
    id: randomUUID(),
    label: STRATEGY_LABELS[strategy],
    strategy,
    status,
    assignments,
    metricsByPhase,
    diagnostics,
    createdAt: new Date().toISOString(),
  };
}

/** Centre approximatif de la zone de travail (pour la météo). */
export function workAreaCenter(mission: Mission): [number, number] {
  const ring = mission.workArea.coordinates[0];
  const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lng, lat];
}

export async function tryWeather(mission: Mission): Promise<Weather | undefined> {
  const [lng, lat] = workAreaCenter(mission);
  try {
    return await fetchWeather(lat, lng);
  } catch {
    return undefined; // pas de réseau : on calcule sans météo
  }
}
