import { PRIORITY_WEIGHTS, type Assignment, type Grid, type MetricsEngine } from '@aeris/shared';
import { distanceM } from './distance';

/** Nombre de drones couvrant chaque cellule (index = cell.id). */
export function coverageCounts(grid: Grid, assignments: Assignment[]): Uint16Array {
  const counts = new Uint16Array(grid.cells.length);
  for (const a of assignments) {
    const p = a.position.coordinates;
    for (const cell of grid.cells) {
      if (!cell.forbidden && distanceM(p, cell.center) <= a.radiusM) counts[cell.id]++;
    }
  }
  return counts;
}

export const computeMetrics: MetricsEngine = (grid, assignments, opts = {}) => {
  const n = grid.cells.length;
  const counts = coverageCounts(grid, assignments);
  const served = new Uint8Array(n);
  for (const a of assignments) {
    const p = a.position.coordinates;
    for (const cell of grid.cells) {
      if (cell.forbidden || served[cell.id]) continue;
      if (distanceM(p, cell.center) > a.radiusM) continue;
      if (!opts.canServe || opts.canServe(a.resourceId, cell)) served[cell.id] = 1;
    }
  }

  let coverable = 0;
  let covered = 0;
  let multi = 0;
  let forbidden = 0;
  let prioTotal = 0;
  let prioServed = 0;
  let wTotal = 0;
  let wServed = 0;
  for (const cell of grid.cells) {
    if (cell.forbidden) {
      forbidden++;
      continue;
    }
    coverable++;
    const w = PRIORITY_WEIGHTS[cell.priorityLevel] ?? 1;
    wTotal += w;
    if (counts[cell.id] > 0) covered++;
    if (counts[cell.id] > 1) multi++;
    if (served[cell.id]) wServed += w;
    if (cell.priorityLevel > 0) {
      prioTotal++;
      if (served[cell.id]) prioServed++;
    }
  }

  const area = grid.cellAreaM2;
  return {
    coverage: coverable ? covered / coverable : 0,
    priorityCoverage: prioTotal ? prioServed / prioTotal : 1,
    weightedCoverage: wTotal ? wServed / wTotal : 0,
    overlap: covered ? multi / covered : 0,
    coveredAreaM2: covered * area,
    uncoveredAreaM2: (coverable - covered) * area,
    forbiddenAreaM2: forbidden * area,
    communes: [], // TODO(P3) : geo.api.gouv.fr/communes?lat=&lon= sur les cellules couvertes
  };
};
