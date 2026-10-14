import { randomUUID } from 'node:crypto';
import { drones, pilotRules } from '@aeris/data';
import { buildGrid, computeMetrics } from '@aeris/geo';
import { solve } from '@aeris/solver';
import { deconflict } from '@aeris/deconflict';
import { excludedByWeather, fetchWeather } from '@aeris/weather';
import {
  meetsRequirement,
  type Assignment,
  type Cell,
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

export function metricsFor(mission: Mission, phase: number, assignments: Assignment[]): Metrics {
  return computeMetrics(buildGrid(mission, phase), assignments, { canServe: canServeFor(mission) });
}

export interface BuildOptions {
  weather?: Weather;
  /** Solution courante (recalcul en conduite) : stabilité des positions. */
  previous?: Assignment[];
  /** Phases à calculer (défaut : toutes). */
  phases?: number[];
}

/** Grille → solveur → séparation → métriques, phase par phase. */
export async function buildProposal(
  mission: Mission,
  strategy: Strategy,
  opts: BuildOptions = {},
): Promise<Proposal> {
  const phases = opts.phases ?? [...Array(mission.phaseCount).keys()];
  const excluded = opts.weather ? excludedByWeather(mission.resources, drones, opts.weather) : {};
  const canServe = canServeFor(mission);
  const assignments: Assignment[] = [];
  const metricsByPhase: Metrics[] = [];
  const diagnostics: string[] = [];
  let status: SolveStatus = 'optimal';
  let previous = opts.previous;

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
    const dc = deconflict(res.assignments);
    assignments.push(...dc.assignments);
    metricsByPhase.push(computeMetrics(grid, dc.assignments, { canServe }));
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
