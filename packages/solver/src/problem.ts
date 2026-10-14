import { booleanPointInPolygon } from '@turf/turf';
import {
  PRIORITY_WEIGHTS,
  maxHeightM,
  meetsRequirement,
  rangeM,
  type Assignment,
  type Cell,
  type DroneModel,
  type PilotLevel,
  type Resource,
  type SolveContext,
  type SolveResult,
  type Strategy,
} from '@aeris/shared';
import { distanceM } from '@aeris/geo';

/**
 * Modèle commun au recuit (greedy.ts) et à l'ILP (ilp.ts) : mêmes candidats, même objectif,
 * pour que les deux solutions soient comparables et que l'ILP puisse garder la meilleure.
 *
 *   score = Σ w_i·[i servie] − α·Σ w_i·max(0, n_i − 1) − Σ coût de déplacement − Σ coût d'engagement
 */

/** Espacement des positions candidates (compromis précision / temps de calcul). */
export const CANDIDATE_SPACING_M = 300;
/** Part du gain d'un disque complet perdue quand un couple se déplace d'un rayon (stabilité). */
const STABILITY_PENALTY = 0.15;
/** Pénalité de chevauchement, relative au poids de la cellule couverte deux fois. */
const OVERLAP_PENALTY: Record<Strategy, number> = {
  couverture_globale: 0.1,
  priorite: 0.05,
  economie_moyens: 0.1,
};
/**
 * Chevauchement souhaité sur les zones prioritaires, dans [PRIORITY_OVERLAP_MIN, PRIORITY_OVERLAP_MAX] :
 *   0 = pénalisé comme ailleurs (une seule couverture suffit) ;
 *   1 = une seconde couverture d'une cellule prioritaire vaut autant que la première (redondance).
 * Interpolation linéaire entre les deux. Codé en dur pour l'instant, en attendant le réglage côté front.
 */
export const PRIORITY_OVERLAP_MIN = 0;
export const PRIORITY_OVERLAP_MAX = 1;
export const PRIORITY_OVERLAP = 0.3;

/** Ramène un réglage de chevauchement prioritaire dans les bornes autorisées. */
export function clampPriorityOverlap(v: number): number {
  if (!Number.isFinite(v)) return PRIORITY_OVERLAP_MIN;
  return Math.min(PRIORITY_OVERLAP_MAX, Math.max(PRIORITY_OVERLAP_MIN, v));
}

/** Stratégie « économie de moyens » : un couple doit apporter au moins ça pour être engagé. */
export const MIN_MARGINAL_GAIN = 0.03;

export interface Usable {
  res: Resource;
  level: PilotLevel;
  radius: number;
  model: DroneModel;
  fixed: boolean;
  /** Positions possibles (une seule si position imposée). */
  candidates: [number, number][];
  /** Grille d'origine des candidats (pour en extraire un sous-ensemble plus grossier). */
  candidateCells: (Cell | undefined)[];
  /** Pour chaque candidat : cellules utiles (poids > 0, capacités satisfaites) à portée. */
  covers: Int32Array[];
  /** Pour chaque candidat : pénalité de déplacement depuis la solution précédente. */
  moveCost: Float64Array;
}

export interface Problem {
  ctx: SolveContext;
  usable: Usable[];
  diagnostics: string[];
  weights: Float64Array;
  totalWeight: number;
  /** Nombre max de couples engagés (arrêté). */
  maxEngaged: number;
  overlapPenalty: number;
  /** Valeur d'une seconde couverture, par cellule (bonus si prioritaire, pénalité sinon). */
  secondValue: Float64Array;
  /** Coût d'engagement d'un couple non imposé (non nul seulement en économie de moyens). */
  droneCost: number;
}

function cellWeight(cell: Cell, strategy: Strategy): number {
  if (cell.forbidden) return 0;
  return strategy === 'couverture_globale' ? 1 : (PRIORITY_WEIGHTS[cell.priorityLevel] ?? 1);
}

/** Construit le modèle, ou renvoie directement un résultat « infaisable » expliqué. */
export function buildProblem(ctx: SolveContext): Problem | SolveResult {
  const { mission, grid, catalog, rules, strategy, previous, excluded = {} } = ctx;
  const diagnostics: string[] = [];
  const models = new Map(catalog.map((m) => [m.id, m]));
  const pilots = new Map(mission.pilots.map((p) => [p.id, p]));

  const weights = Float64Array.from(grid.cells, (c) => cellWeight(c, strategy));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const stride = Math.max(1, Math.round(CANDIDATE_SPACING_M / grid.cellSizeM));
  const baseCandidates = grid.cells.filter(
    (c) => !c.forbidden && c.row % stride === 0 && c.col % stride === 0,
  );
  const prevByRes = new Map((previous ?? []).map((a) => [a.resourceId, a]));
  const meanWeight = grid.cells.length > 0 ? totalWeight / grid.cells.length : 0;

  const usable: Usable[] = [];
  for (const res of mission.resources) {
    if (!res.available) {
      diagnostics.push(`${res.id} indisponible`);
      continue;
    }
    if (excluded[res.id]) {
      diagnostics.push(`${res.id} exclu : ${excluded[res.id]}`);
      continue;
    }
    const model = models.get(res.droneModelId);
    const pilot = pilots.get(res.pilotId);
    if (!model || !pilot) {
      diagnostics.push(`${res.id} : drone ou télépilote inconnu`);
      continue;
    }
    const radius = rangeM(rules, pilot.level);
    let candidates: [number, number][];
    let candidateCells: (Cell | undefined)[];
    if (res.fixedPosition) {
      candidates = [res.fixedPosition.coordinates as [number, number]];
      candidateCells = [undefined];
    } else {
      const allowed = res.allowedArea;
      candidateCells = allowed
        ? baseCandidates.filter((c) => booleanPointInPolygon(c.center, allowed))
        : baseCandidates;
      candidates = candidateCells.map((c) => c!.center);
      if (candidates.length === 0) {
        diagnostics.push(`${res.id} : aucune position possible dans sa zone limite`);
        continue;
      }
    }

    const useful = grid.cells.filter(
      (c) => weights[c.id]! > 0 && meetsRequirement(model, c.requires),
    );
    // Pré-filtre par boîte englobante (marge de 10 %) avant la distance exacte.
    const dLat = (radius / 111_000) * 1.1;
    const covers = candidates.map((p) => {
      const dLng = dLat / Math.cos((p[1] * Math.PI) / 180);
      const ids: number[] = [];
      for (const c of useful) {
        if (Math.abs(c.center[1] - p[1]) > dLat || Math.abs(c.center[0] - p[0]) > dLng) continue;
        if (distanceM(p, c.center) <= radius) ids.push(c.id);
      }
      return Int32Array.from(ids);
    });
    // Déplacer un couple d'un rayon complet coûte STABILITY_PENALTY d'un disque moyen.
    const prev = prevByRes.get(res.id)?.position.coordinates as [number, number] | undefined;
    const discWeight = (Math.PI * radius * radius * meanWeight) / grid.cellAreaM2;
    const moveCost = Float64Array.from(candidates, (p) =>
      prev && !res.fixedPosition
        ? STABILITY_PENALTY * discWeight * Math.min(distanceM(prev, p) / radius, 1)
        : 0,
    );
    usable.push({
      res,
      level: pilot.level,
      radius,
      model,
      fixed: !!res.fixedPosition,
      candidates,
      candidateCells,
      covers,
      moveCost,
    });
  }

  if (mission.maxDrones <= 0) {
    return {
      status: 'infaisable',
      assignments: [],
      diagnostics: [...diagnostics, 'Arrêté : aucun drone autorisé (maxDrones = 0)'],
    };
  }
  if (usable.length === 0) {
    return {
      status: 'infaisable',
      assignments: [],
      diagnostics: [...diagnostics, 'Aucun couple drone-télépilote employable'],
    };
  }

  // Positions imposées d'abord, puis les plus grandes portées (ordre de la construction gloutonne).
  usable.sort((a, b) => Number(b.fixed) - Number(a.fixed) || b.radius - a.radius);
  // Plus de positions imposées que l'arrêté n'en permet : on garde les premières.
  const fixedCount = usable.filter((u) => u.fixed).length;
  if (fixedCount > mission.maxDrones) {
    const dropped = usable.splice(mission.maxDrones, fixedCount - mission.maxDrones);
    for (const u of dropped)
      diagnostics.push(`${u.res.id} non engagé : arrêté (${mission.maxDrones} drones max)`);
  }

  return {
    ctx,
    usable,
    diagnostics,
    weights,
    totalWeight,
    maxEngaged: mission.maxDrones,
    overlapPenalty: OVERLAP_PENALTY[strategy],
    secondValue: Float64Array.from(grid.cells, (c, i) => {
      const alpha = OVERLAP_PENALTY[strategy];
      const beta = c.priorityLevel > 0 ? clampPriorityOverlap(PRIORITY_OVERLAP) : 0;
      return (beta - alpha * (1 - beta)) * weights[i]!;
    }),
    droneCost: strategy === 'economie_moyens' ? MIN_MARGINAL_GAIN * totalWeight : 0,
  };
}

/** Valeur de la (n+1)-ième couverture de la cellule i (n couples la servent déjà). */
export function marginal(p: Problem, i: number, n: number): number {
  if (n === 0) return p.weights[i]!;
  if (n === 1) return p.secondValue[i]!;
  return -p.overlapPenalty * p.weights[i]!;
}

export function isProblem(p: Problem | SolveResult): p is Problem {
  return 'usable' in p;
}

/**
 * Solution : pour chaque couple de `problem.usable`, l'indice du candidat retenu, ou -1.
 * Score calculé de zéro (sert à comparer des solutions d'origines différentes).
 */
export function score(problem: Problem, choice: Int32Array): number {
  const count = new Int32Array(problem.weights.length);
  let s = 0;
  problem.usable.forEach((u, k) => {
    const j = choice[k]!;
    if (j < 0) return;
    s -= u.moveCost[j]! + (u.fixed ? 0 : problem.droneCost);
    for (const i of u.covers[j]!) count[i]!++;
  });
  for (let i = 0; i < count.length; i++) {
    const n = count[i]!;
    for (let m = 0; m < n; m++) s += marginal(problem, i, m);
  }
  return s;
}

/** Transforme une solution en résultat du contrat `Solver`, avec ses diagnostics. */
export function toResult(problem: Problem, choice: Int32Array, extra: string[] = []): SolveResult {
  const { ctx, usable } = problem;
  const { grid, rules, mission, phase } = ctx;
  const diagnostics = [...problem.diagnostics];
  const assignments: Assignment[] = [];
  const covered = new Uint8Array(grid.cells.length);
  const engaged = usable.filter((_, k) => choice[k]! >= 0).length;

  usable.forEach((u, k) => {
    const j = choice[k]!;
    if (j < 0) {
      if (engaged >= problem.maxEngaged)
        diagnostics.push(`${u.res.id} non engagé : arrêté (${problem.maxEngaged} drones max)`);
      else if (problem.droneCost > 0)
        diagnostics.push(`${u.res.id} non engagé : apport marginal < ${MIN_MARGINAL_GAIN * 100} %`);
      else diagnostics.push(`${u.res.id} non engagé : aucun apport de couverture`);
      return;
    }
    for (const i of u.covers[j]!) covered[i] = 1;
    assignments.push({
      resourceId: u.res.id,
      phase,
      position: { type: 'Point', coordinates: u.candidates[j]! },
      radiusM: u.radius,
      // Plafond réglementaire du niveau ; les tranches fines sont attribuées par @aeris/deconflict.
      altitude: { minM: 0, maxM: maxHeightM(rules, u.level, mission.environment) },
    });
  });

  const unmetPriority = grid.cells.filter(
    (c) => c.priorityLevel > 0 && !c.forbidden && !covered[c.id],
  ).length;
  if (unmetPriority > 0) {
    diagnostics.push(
      `${Math.round((unmetPriority * grid.cellAreaM2) / 1e4)} ha de zone prioritaire non couverts (ou sans drone aux capacités requises)`,
    );
  }
  diagnostics.push(...extra);

  return {
    status: assignments.length > 0 ? 'faisable' : 'infaisable',
    assignments,
    diagnostics,
  };
}
