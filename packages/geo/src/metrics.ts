import { PRIORITY_WEIGHTS, type Assignment, type Grid, type MetricsEngine } from '@aeris/shared';
import { presenceAuPireMoment } from './presence';
import { indexerGrille, type IndexGrille } from './voisinage';

/**
 * Nombre de drones couvrant chaque cellule (index = cell.id), au pire moment de la phase :
 * si des drones alternent par créneaux, on compte ceux présents au moment le moins couvert.
 */
export function coverageCounts(
  grid: Grid,
  assignments: Assignment[],
  index: IndexGrille = indexerGrille(grid),
): Uint16Array {
  return presenceAuPireMoment(grid, index, assignments);
}

export const computeMetrics: MetricsEngine = (grid, assignments, opts = {}) => {
  const index = indexerGrille(grid);
  const counts = coverageCounts(grid, assignments, index);
  // Servie : au moins un drone capable présent à tout instant de la phase.
  const served = presenceAuPireMoment(
    grid,
    index,
    assignments,
    (a, cell) => !opts.canServe || opts.canServe(a.resourceId, cell),
  );

  let coverable = 0;
  let covered = 0;
  let multi = 0;
  let forbidden = 0;
  let prioTotal = 0;
  let prioServed = 0;
  let wTotal = 0;
  let wServed = 0;
  let useful = 0;
  let superfluous = 0;
  let demanding = 0;
  let met = 0;
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
    if (served[cell.id] > 0) wServed += w;
    if (cell.priorityLevel > 0) {
      prioTotal++;
      if (served[cell.id] > 0) prioServed++;
    }
    // Redondance : n drones vus au pire moment, comparés aux r voulus sur la cellule.
    const r = cell.redundancy;
    if (counts[cell.id] >= 2 && counts[cell.id] <= r) useful++;
    if (counts[cell.id] > r) superfluous++;
    if (r >= 2) {
      demanding++;
      if (served[cell.id] >= r) met++;
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
    // Communes et zones : remplies par le pipeline de l'API, qui a les contours et la mission.
    communes: [],
    usefulOverlap: covered ? useful / covered : 0,
    superfluousOverlap: covered ? superfluous / covered : 0,
    redundancyMet: demanding ? met / demanding : 1,
  };
};
