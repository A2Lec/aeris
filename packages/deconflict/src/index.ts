import type { Assignment, Conflict, Deconflicter, Grid } from '@aeris/shared';
import { distanceM } from '@aeris/geo';

/** Hauteur d'une tranche d'altitude attribuée à un couple. */
const BAND_M = 20;
/** Hauteur minimale de sécurité. */
const FLOOR_M = 10;

/** Plafond effectif : plafond du couple, abaissé par les plafonds locaux sous son disque. */
function localCeiling(a: Assignment, grid: Grid): number {
  let ceiling = a.altitude.maxM;
  for (const cell of grid.cells) {
    if (cell.maxHeightM === undefined || cell.maxHeightM >= ceiling) continue;
    if (distanceM(a.position.coordinates, cell.center) <= a.radiusM) ceiling = cell.maxHeightM;
  }
  return ceiling;
}

function horizontalOverlap(a: Assignment, b: Assignment): boolean {
  return distanceM(a.position.coordinates, b.position.coordinates) < a.radiusM + b.radiusM;
}

function verticalOverlap(a: Assignment, b: Assignment): boolean {
  return a.altitude.minM < b.altitude.maxM && b.altitude.minM < a.altitude.maxM;
}

/** Paires de couples d'une même phase qui partagent un volume (horizontal ET vertical). */
export function detectConflicts(assignments: Assignment[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];
      if (a.phase !== b.phase) continue;
      if (horizontalOverlap(a, b) && verticalOverlap(a, b)) {
        out.push({ a: a.resourceId, b: b.resourceId, phase: a.phase });
      }
    }
  }
  return out;
}

/**
 * v0 : séparation VERTICALE seule — chaque couple reçoit une tranche de 20 m sous
 * son plafond (abaissé par les plafonds locaux, ex. terrain militaire), différente
 * de celles de ses voisins qui se chevauchent.
 *
 * TODO(P4) — cascade complète du brief :
 *   1. horizontal : secteurs distincts (Voronoï des positions découpé par les cercles → `sector`)
 *   2. vertical   : tranches compatibles avec les capacités (urbain…)
 *   3. temporel   : créneaux décalés (`slot`) dans la phase
 *   4. renoncer   : retirer temporairement le couple le moins utile, et le dire
 */
export const deconflict: Deconflicter = (assignments, ctx) => {
  const placed: Assignment[] = [];
  const diagnostics: string[] = [];

  for (const a of assignments) {
    const ceiling = localCeiling(a, ctx.grid);
    const neighbours = placed.filter((p) => p.phase === a.phase && horizontalOverlap(a, p));
    let chosen: Assignment | undefined;
    for (let k = 0; ceiling - (k + 1) * BAND_M >= FLOOR_M; k++) {
      const candidate: Assignment = {
        ...a,
        altitude: { minM: ceiling - (k + 1) * BAND_M, maxM: ceiling - k * BAND_M },
      };
      if (neighbours.every((n) => !verticalOverlap(candidate, n))) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      chosen = { ...a, altitude: { minM: Math.max(FLOOR_M, ceiling - BAND_M), maxM: ceiling } };
      diagnostics.push(
        `${a.resourceId} : aucune tranche d'altitude libre (séparation temporelle nécessaire)`,
      );
    }
    placed.push(chosen);
  }

  const conflicts = detectConflicts(placed);
  for (const c of conflicts)
    diagnostics.push(`Conflit non résolu ${c.a} / ${c.b} (phase ${c.phase + 1})`);
  return { assignments: placed, conflicts, diagnostics };
};
