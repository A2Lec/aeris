import { randomUUID } from 'node:crypto';
import { communesDemo, pilotRules } from '@aeris/data';
import {
  buildGrid,
  communesConcernees,
  computeMetrics,
  couchesParCouple,
  couvertureParZone,
  coverageGeometry,
  mesurerStabilite,
} from '@aeris/geo';
import { needsSizing, sizeFleet, solve } from '@aeris/solver';
import { deconflict } from '@aeris/deconflict';
import { excludedByWeather, fetchWeather, flyability, weatherForPhase } from '@aeris/weather';
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
import { getDrones } from '../catalogStore';

export const STRATEGY_LABELS: Record<Strategy, string> = {
  couverture_globale: 'Couverture maximale',
  priorite: 'Zones prioritaires d’abord',
  economie_moyens: 'Économie de moyens',
};

const SEVERITY: Record<SolveStatus, number> = { optimal: 0, faisable: 1, infaisable: 2 };

export function canServeFor(mission: Mission, catalog = getDrones()) {
  const modelByRes = new Map(
    mission.resources.map((r) => [r.id, catalog.find((d) => d.id === r.droneModelId)]),
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
function fullMetrics(
  mission: Mission,
  grid: Grid,
  assignments: Assignment[],
  catalog = getDrones(),
): Metrics {
  const canServe = canServeFor(mission, catalog);
  return {
    ...computeMetrics(grid, assignments, { canServe }),
    communes: communesConcernees(grid, assignments, communesDemo),
    byZone: couvertureParZone(mission, grid, assignments, { canServe }),
  };
}

export function metricsFor(
  mission: Mission,
  phase: number,
  assignments: Assignment[],
  catalog = getDrones(),
): Metrics {
  return fullMetrics(mission, buildGrid(mission, phase), assignments, catalog);
}

export interface BuildOptions {
  weather?: Weather;
  /** Solution courante (recalcul en conduite) : stabilité des positions. */
  previous?: Assignment[];
  /** Phases à calculer (défaut : toutes). */
  phases?: number[];
}

export function coverageFor(mission: Mission, phase: number, assignments: Assignment[]) {
  const catalog = getDrones();
  const grid = buildGrid(mission, phase);
  const ofPhase = assignments.filter((a) => a.phase === phase);
  return {
    ...coverageGeometry(grid, ofPhase, { canServe: canServeFor(mission, catalog) }),
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
  const catalog = getDrones();
  return mesurerStabilite(buildGrid(mission, phase), before, after, {
    canServe: canServeFor(mission, catalog),
  });
}

/** Grille → solveur → séparation → métriques, phase par phase. */
export async function buildProposal(
  mission: Mission,
  strategy: Strategy,
  opts: BuildOptions = {},
): Promise<Proposal> {
  const phases = opts.phases ?? [...Array(mission.phaseCount).keys()];
  const catalog = getDrones();
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
    const excluded = excludedForPhase(mission, phase, opts.weather, catalog);
    const res = await solve({
      mission,
      catalog,
      rules: pilotRules,
      grid,
      phase,
      strategy,
      excluded,
      previous,
    });
    const dc = deconflict(res.assignments, {
      mission,
      catalog,
      rules: pilotRules,
      grid,
      phase,
    });
    assignments.push(...dc.assignments);
    metricsByPhase.push(fullMetrics(mission, grid, dc.assignments, catalog));
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

/**
 * Couples que la météo interdit pendant une phase : { resourceId: raison }.
 * Le jour ou la nuit vient de l'horaire de la phase, pas de l'heure du calcul (une mission
 * planifiée de 8 h à 12 h reste de jour, même calculée le soir). Sans période déclarée, on
 * garde l'état mesuré. Une météo de repli n'est pas une mesure : elle n'écarte aucun drone.
 */
export function excludedForPhase(
  mission: Mission,
  phase: number,
  weather: Weather | undefined,
  catalog = getDrones(),
): Record<string, string> {
  if (!weather || weather.source === 'repli') return {};
  const [lng, lat] = workAreaCenter(mission);
  const w = mission.period ? weatherForPhase(weather, mission, phase, lat, lng) : weather;
  return excludedByWeather(mission.resources, catalog, w);
}

/**
 * Planification sans moyens réels : le solveur dimensionne la flotte (nombre de drones et de
 * télépilotes, modèles de la bibliothèque) et la mission reçoit ces couples génériques.
 * Une mission qui a déjà des couples nommés est laissée telle quelle.
 */
export function sizeMission(
  mission: Mission,
  weather?: Weather,
): { mission: Mission; diagnostics: string[] } {
  if (!needsSizing(mission)) return { mission, diagnostics: [] };
  const realWeather = weather?.source === 'repli' ? undefined : weather;
  const phases = [...Array(mission.phaseCount).keys()];
  // Même règle que excludedForPhase : le jour ou la nuit suit l'horaire de chaque phase.
  const [lng, lat] = workAreaCenter(mission);
  const phaseWeathers = realWeather
    ? phases.map((phase) =>
        mission.period ? weatherForPhase(realWeather, mission, phase, lat, lng) : realWeather,
      )
    : [];
  const sizing = sizeFleet({
    mission,
    catalog: getDrones(),
    rules: pilotRules,
    grids: phases.map((phase) => buildGrid(mission, phase)),
    flyable: realWeather
      ? (model) => phaseWeathers.every((w) => flyability(model, w).ok)
      : undefined,
  });
  return {
    mission: { ...mission, pilots: sizing.pilots, resources: sizing.resources },
    diagnostics: sizing.diagnostics,
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
