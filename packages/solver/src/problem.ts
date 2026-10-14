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
 *   score = Σ w_i·min(n_i, r_i)/r_i − α·Σ w_i·max(0, n_i − r_i) − Σ coût de déplacement − Σ coût d'engagement
 *
 * n_i : couples capables qui servent la cellule ; r_i : drones voulus en même temps
 * (`cell.redundancy`, réglé zone par zone dans le front). Même crédit partiel que
 * @aeris/geo (redondance.ts) : le solveur optimise ce que la carte mesure.
 */

/** Espacement des positions candidates (compromis précision / temps de calcul). */
export const CANDIDATE_SPACING_M = 300;
/** Part du gain d'un disque complet perdue quand un couple se déplace d'un rayon (stabilité). */
const STABILITY_PENALTY = 0.15;
/**
 * Tout déplacement coûte au moins cette part de la pénalité maximale : en conduite, bouger
 * un drone l'interrompt, même pour 100 m. Évite les micro-ajustements à chaque recalcul.
 */
const MIN_MOVE_SHARE = 0.25;
/**
 * Aversion aux trous : un hectare laissé sans drone coûte autant que GAP_AVERSION hectares
 * de chevauchement superflu. Plus elle est forte, plus le solveur accepte de faire se
 * recouvrir les disques pour boucher les trous. « Économie de moyens » garde une pénalité
 * de chevauchement plus forte : c'est elle qui justifie de ne pas engager un drone de plus.
 */
export const GAP_AVERSION = 50;
const OVERLAP_PENALTY: Record<Strategy, number> = {
  couverture_globale: 1 / GAP_AVERSION,
  priorite: 1 / GAP_AVERSION,
  economie_moyens: 0.1,
};
/**
 * Bonus pour chaque couple engagé « dans » la zone prioritaire, en % du poids total de la grille.
 * Favorise l'emploi d'un plus grand nombre de drones sur les zones prioritaires (redondance,
 * relève, angles de vue). 0 = désactivé ; plafonné à PRIORITY_DRONE_BONUS_MAX.
 * Désactivé par défaut : à 2 %, il attirait les drones vers les zones prioritaires au prix de
 * trous ailleurs (démo : 135 ha de trous au lieu de 90 ; 25 ha au lieu de 0 avec 9 drones).
 */
export const PRIORITY_DRONE_BONUS_MAX = 10;
export const PRIORITY_DRONE_BONUS = 0;
/** Un couple est « dans » la zone prioritaire si au moins cette part de ce qu'il couvre y est. */
export const PRIORITY_DRONE_MIN_SHARE = 0.2;

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
  /** Candidat le plus proche de la position précédente (-1 si le couple n'était pas placé). */
  prevIndex: number;
  /** Pour chaque candidat : bonus s'il place le couple dans la zone prioritaire (0 sinon). */
  priorityBonus: Float64Array;
  /** Cellules que le couple peut servir (poids > 0, capacités satisfaites). */
  useful: Cell[];
  /** Position dans la solution précédente. */
  prev?: [number, number];
  /** Poids d'un disque moyen (échelle du coût de déplacement). */
  discWeight: number;
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
  /** Coût d'engagement d'un couple non imposé (non nul seulement en économie de moyens). */
  droneCost: number;
}

function cellWeight(cell: Cell, strategy: Strategy): number {
  if (cell.forbidden) return 0;
  return strategy === 'couverture_globale' ? 1 : (PRIORITY_WEIGHTS[cell.priorityLevel] ?? 1);
}

/** Couverture, coût de déplacement et bonus prioritaire d'une position pour un couple. */
function candidateData(cells: Cell[], u: Usable, pos: [number, number], totalWeight: number) {
  // Pré-filtre par boîte englobante (marge de 10 %) avant la distance exacte.
  const dLat = (u.radius / 111_000) * 1.1;
  const dLng = dLat / Math.cos((pos[1] * Math.PI) / 180);
  const ids: number[] = [];
  let prio = 0;
  for (const c of u.useful) {
    if (Math.abs(c.center[1] - pos[1]) > dLat || Math.abs(c.center[0] - pos[0]) > dLng) continue;
    if (distanceM(pos, c.center) > u.radius) continue;
    ids.push(c.id);
    if (cells[c.id]!.priorityLevel > 0) prio++;
  }
  const shift = u.prev ? distanceM(u.prev, pos) : 0;
  const moveCost =
    shift > 1
      ? STABILITY_PENALTY * u.discWeight * Math.max(MIN_MOVE_SHARE, Math.min(shift / u.radius, 1))
      : 0;
  const bonusValue =
    (Math.min(Math.max(PRIORITY_DRONE_BONUS, 0), PRIORITY_DRONE_BONUS_MAX) / 100) * totalWeight;
  const inPriority = ids.length > 0 && prio / ids.length >= PRIORITY_DRONE_MIN_SHARE;
  return { covers: Int32Array.from(ids), moveCost, bonus: inPriority ? bonusValue : 0 };
}

/** Ajoute une position candidate au couple k (affinage) ; renvoie son indice. */
export function addCandidate(p: Problem, k: number, cell: Cell): number {
  const u = p.usable[k]!;
  const d = candidateData(p.ctx.grid.cells, u, cell.center, p.totalWeight);
  u.candidates.push(cell.center);
  u.candidateCells.push(cell);
  u.covers.push(d.covers);
  u.moveCost = Float64Array.from([...u.moveCost, d.moveCost]);
  u.priorityBonus = Float64Array.from([...u.priorityBonus, d.bonus]);
  return u.candidates.length - 1;
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

    const prev = prevByRes.get(res.id)?.position.coordinates as [number, number] | undefined;
    const u: Usable = {
      res,
      level: pilot.level,
      radius,
      model,
      fixed: !!res.fixedPosition,
      candidates: [],
      candidateCells: [],
      covers: [],
      moveCost: new Float64Array(0),
      prevIndex: -1,
      priorityBonus: new Float64Array(0),
      useful: grid.cells.filter((c) => weights[c.id]! > 0 && meetsRequirement(model, c.requires)),
      prev: res.fixedPosition ? undefined : prev,
      // Déplacer un couple d'un rayon complet coûte STABILITY_PENALTY d'un disque moyen.
      discWeight: (Math.PI * radius * radius * meanWeight) / grid.cellAreaM2,
    };
    const data = candidates.map((pos) => candidateData(grid.cells, u, pos, totalWeight));
    u.candidates = candidates;
    u.candidateCells = candidateCells;
    u.covers = data.map((d) => d.covers);
    u.moveCost = Float64Array.from(data, (d) => d.moveCost);
    u.priorityBonus = Float64Array.from(data, (d) => d.bonus);
    if (u.prev) {
      let bestD = Infinity;
      candidates.forEach((c, j) => {
        const d = distanceM(u.prev!, c);
        if (d < bestD) {
          bestD = d;
          u.prevIndex = j;
        }
      });
    }
    usable.push(u);
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
    droneCost: strategy === 'economie_moyens' ? MIN_MARGINAL_GAIN * totalWeight : 0,
  };
}

/** Valeur de la (n+1)-ième couverture de la cellule i (n couples la servent déjà). */
export function marginal(p: Problem, i: number, n: number): number {
  const r = redundancyOf(p, i);
  return n < r ? p.weights[i]! / r : -p.overlapPenalty * p.weights[i]!;
}

/** Drones voulus en même temps sur la cellule i (au moins 1). */
export function redundancyOf(p: Problem, i: number): number {
  return Math.max(1, p.ctx.grid.cells[i]!.redundancy ?? 1);
}

/** Coût (négatif = gain) de placer le couple k au candidat j, hors couverture. */
export function candidateCost(p: Problem, k: number, j: number): number {
  const u = p.usable[k]!;
  return u.moveCost[j]! + (u.fixed ? 0 : p.droneCost) - u.priorityBonus[j]!;
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
    s -= candidateCost(problem, k, j);
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
  const served = new Int32Array(grid.cells.length);
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
    for (const i of u.covers[j]!) {
      covered[i] = 1;
      served[i]!++;
    }
    assignments.push({
      resourceId: u.res.id,
      phase,
      position: { type: 'Point', coordinates: u.candidates[j]! },
      radiusM: u.radius,
      // Plafond réglementaire du niveau ; les tranches fines sont attribuées par @aeris/deconflict.
      altitude: { minM: 0, maxM: maxHeightM(rules, u.level, mission.environment) },
    });
  });

  const ha = (cells: number) => Math.round((cells * grid.cellAreaM2) / 1e4);
  const coverable = grid.cells.filter((c) => !c.forbidden).length;
  const gaps = grid.cells.filter((c) => !c.forbidden && !covered[c.id]).length;
  if (gaps > 0) {
    diagnostics.push(
      `${ha(gaps)} ha de trous (${((100 * gaps) / coverable).toFixed(1)} % de la zone)`,
    );
    // Borne physique : même sans aucun chevauchement, les disques ne suffisent pas.
    const maxDiscs = usable
      .map((u) => Math.PI * u.radius * u.radius)
      .sort((x, y) => y - x)
      .slice(0, problem.maxEngaged)
      .reduce((t, x) => t + x, 0);
    if (maxDiscs < coverable * grid.cellAreaM2) {
      diagnostics.push(
        `Couverture complète impossible : ${Math.min(usable.length, problem.maxEngaged)} drone(s) couvrent au plus ${Math.round(maxDiscs / 1e4)} ha pour ${ha(coverable)} ha à couvrir`,
      );
    }
  }
  const unmetPriority = grid.cells.filter(
    (c) => c.priorityLevel > 0 && !c.forbidden && !covered[c.id],
  ).length;
  if (unmetPriority > 0) {
    diagnostics.push(
      `${Math.round((unmetPriority * grid.cellAreaM2) / 1e4)} ha de zone prioritaire non couverts (ou sans drone aux capacités requises)`,
    );
  }
  const short = grid.cells.filter(
    (c) => !c.forbidden && c.redundancy >= 2 && served[c.id]! < c.redundancy,
  ).length;
  if (short > 0) {
    diagnostics.push(
      `${Math.round((short * grid.cellAreaM2) / 1e4)} ha n'ont pas le nombre de drones voulus en même temps (redondance)`,
    );
  }
  diagnostics.push(...extra);

  return {
    status: assignments.length > 0 ? 'faisable' : 'infaisable',
    assignments,
    diagnostics,
  };
}
