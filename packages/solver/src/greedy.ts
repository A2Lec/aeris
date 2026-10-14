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

/** Espacement des positions candidates (compromis précision / temps de calcul). */
const CANDIDATE_SPACING_M = 300;
/** Part du gain perdue quand un couple se déplace d'un rayon complet (stabilité). */
const STABILITY_PENALTY = 0.15;
/** Stratégie « économie de moyens » : on n'engage pas un couple qui apporte moins que ça. */
const MIN_MARGINAL_GAIN = 0.03;

function cellWeight(cell: Cell, strategy: Strategy): number {
  if (cell.forbidden) return 0;
  return strategy === 'couverture_globale' ? 1 : (PRIORITY_WEIGHTS[cell.priorityLevel] ?? 1);
}

interface Usable {
  res: Resource;
  level: PilotLevel;
  radius: number;
  model: DroneModel;
}

/**
 * Heuristique gloutonne de couverture maximale pondérée (MCLP).
 * Sert de solveur v0 et de secours si l'ILP (ilp.ts) dépasse le temps imparti.
 */
export function greedySolve(ctx: SolveContext): SolveResult {
  const { mission, grid, catalog, rules, strategy, phase, previous, excluded = {} } = ctx;
  const diagnostics: string[] = [];
  const models = new Map(catalog.map((m) => [m.id, m]));
  const pilots = new Map(mission.pilots.map((p) => [p.id, p]));

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
    usable.push({ res, level: pilot.level, radius: rangeM(rules, pilot.level), model });
  }

  // Positions imposées d'abord, puis les plus grandes portées.
  usable.sort(
    (a, b) => Number(!!b.res.fixedPosition) - Number(!!a.res.fixedPosition) || b.radius - a.radius,
  );
  if (usable.length > mission.maxDrones) {
    diagnostics.push(
      `Arrêté : ${mission.maxDrones} drones max, ${usable.length - mission.maxDrones} couple(s) non engagé(s)`,
    );
    usable.length = mission.maxDrones;
  }
  if (usable.length === 0) {
    return {
      status: 'infaisable',
      assignments: [],
      diagnostics: [...diagnostics, 'Aucun couple drone-télépilote employable'],
    };
  }

  const weights = grid.cells.map((c) => cellWeight(c, strategy));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const covered = new Uint8Array(grid.cells.length);
  const stride = Math.max(1, Math.round(CANDIDATE_SPACING_M / grid.cellSizeM));
  const baseCandidates = grid.cells.filter(
    (c) => !c.forbidden && c.row % stride === 0 && c.col % stride === 0,
  );
  const prevByRes = new Map((previous ?? []).map((a) => [a.resourceId, a]));
  const assignments: Assignment[] = [];

  for (const u of usable) {
    const serves = (c: Cell) => meetsRequirement(u.model, c.requires);
    const gainAt = (center: [number, number]) => {
      let g = 0;
      for (const c of grid.cells) {
        if (covered[c.id] || weights[c.id] === 0 || !serves(c)) continue;
        if (distanceM(center, c.center) <= u.radius) g += weights[c.id];
      }
      return g;
    };

    let best: [number, number] | undefined;
    let bestGain = 0;
    if (u.res.fixedPosition) {
      best = u.res.fixedPosition.coordinates;
      bestGain = gainAt(best);
    } else {
      const allowed = u.res.allowedArea;
      const cands = allowed
        ? baseCandidates.filter((c) => booleanPointInPolygon(c.center, allowed))
        : baseCandidates;
      if (cands.length === 0) {
        diagnostics.push(`${u.res.id} : aucune position possible dans sa zone limite`);
        continue;
      }
      const prev = prevByRes.get(u.res.id);
      let bestScore = -Infinity;
      for (const c of cands) {
        const g = gainAt(c.center);
        const move = prev ? distanceM(prev.position.coordinates, c.center) / u.radius : 0;
        const score = g * (1 - STABILITY_PENALTY * Math.min(move, 1));
        if (score > bestScore) {
          bestScore = score;
          best = c.center;
          bestGain = g;
        }
      }
    }
    if (!best) continue;

    if (
      strategy === 'economie_moyens' &&
      !u.res.fixedPosition &&
      bestGain < MIN_MARGINAL_GAIN * totalWeight
    ) {
      diagnostics.push(`${u.res.id} non engagé : apport marginal < ${MIN_MARGINAL_GAIN * 100} %`);
      continue;
    }

    const center = best;
    for (const c of grid.cells) {
      if (serves(c) && distanceM(center, c.center) <= u.radius) covered[c.id] = 1;
    }
    assignments.push({
      resourceId: u.res.id,
      phase,
      position: { type: 'Point', coordinates: center },
      radiusM: u.radius,
      // Plafond réglementaire du niveau ; les tranches fines sont attribuées par @aeris/deconflict.
      altitude: { minM: 0, maxM: maxHeightM(rules, u.level, mission.environment) },
    });
  }

  const unmetPriority = grid.cells.filter(
    (c) => c.priorityLevel > 0 && !c.forbidden && !covered[c.id],
  ).length;
  if (unmetPriority > 0) {
    diagnostics.push(
      `${Math.round((unmetPriority * grid.cellAreaM2) / 1e4)} ha de zone prioritaire non couverts (ou sans drone aux capacités requises)`,
    );
  }

  return {
    status: assignments.length > 0 ? 'faisable' : 'infaisable',
    assignments,
    diagnostics,
  };
}
