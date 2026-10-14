/**
 * Redondance : une zone prioritaire peut exiger r drones en même temps (r fixé par
 * l'utilisateur, 1 par défaut). Sur chaque cellule on compare r au nombre n de drones qui la
 * voient :
 *   - chevauchement utile    : 2 ≤ n ≤ r (les drones voulus en plus du premier) ;
 *   - chevauchement superflu : n > r (le seul que le solveur doit chercher à réduire) ;
 *   - redondance atteinte    : n drones capables ≥ r, sur les cellules où r ≥ 2 ;
 *   - couverture pondérée    : crédit partiel min(n, r) / r du poids de la cellule.
 * Avec r = 1 partout, on retrouve exactement overlap et weightedCoverage de computeMetrics.
 */
import { booleanPointInPolygon } from '@turf/turf';
import {
  PRIORITY_WEIGHTS,
  type Assignment,
  type Grid,
  type Mission,
  type MetricsOptions,
  type MultiPolygonGeom,
} from '@aeris/shared';
import { fusionner } from './coverage';
import { zoneActive } from './grid';
import { indexerGrille, pourChaqueCelluleAPortee } from './voisinage';

// TODO(P1) : quand PriorityZone.redundancy et Cell.redundancy existeront dans @aeris/shared,
// buildGrid remplira cell.redundancy, `redondanceDesCellules` disparaîtra, et les champs de
// `IndicateursRedondance` / `CouchesRedondance` rejoindront Metrics / CoverageLayers.

/** Nombre de drones voulus par zone prioritaire (id de zone → r). Zone absente = 1. */
export type RedondanceParZone = Record<string, number>;

/** r de chaque cellule (index = cell.id) : le plus grand r des zones actives qui la contiennent. */
export function redondanceDesCellules(
  mission: Mission,
  grid: Grid,
  redondances: RedondanceParZone,
): Uint8Array {
  const r = new Uint8Array(grid.cells.length).fill(1);
  const zones = mission.priorityZones.filter(
    (z) => zoneActive(z, grid.phase) && (redondances[z.id] ?? 1) > 1,
  );
  for (const cell of grid.cells) {
    for (const z of zones) {
      if (booleanPointInPolygon(cell.center, z.geometry)) {
        r[cell.id] = Math.max(r[cell.id], Math.min(255, Math.floor(redondances[z.id])));
      }
    }
  }
  return r;
}

export interface IndicateursRedondance {
  /** Part de la surface couverte vue par 2 à r drones (chevauchement voulu). 0..1. */
  usefulOverlap: number;
  /** Part de la surface couverte vue par plus de r drones (chevauchement inutile). 0..1. */
  superfluousOverlap: number;
  /** Part des cellules exigeant r ≥ 2 qui ont leurs r drones capables. 1 s'il n'y en a pas. */
  redundancyMet: number;
  /** Couverture pondérée avec crédit partiel min(n, r) / r. 0..1. */
  weightedCoverage: number;
}

export interface CouchesRedondance {
  phase: number;
  /** Cellules exigeant r ≥ 2 qui ont moins de r drones capables (au moins un drone manque). */
  redundancyMissing: MultiPolygonGeom;
  /** Cellules vues par plus de r drones. */
  superfluousOverlap: MultiPolygonGeom;
}

/** n (tous drones) et n capables (canServe) par cellule non interdite. */
function compter(grid: Grid, assignments: Assignment[], opts: MetricsOptions) {
  const index = indexerGrille(grid);
  const tous = new Uint16Array(grid.cells.length);
  const capables = new Uint16Array(grid.cells.length);
  for (const a of assignments) {
    pourChaqueCelluleAPortee(grid, index, a.position.coordinates, a.radiusM, (cell) => {
      tous[cell.id]++;
      if (!opts.canServe || opts.canServe(a.resourceId, cell)) capables[cell.id]++;
    });
  }
  return { index, tous, capables };
}

export function mesurerRedondance(
  grid: Grid,
  assignments: Assignment[],
  redondance: Uint8Array,
  opts: MetricsOptions = {},
): IndicateursRedondance {
  const { tous, capables } = compter(grid, assignments, opts);
  let couvertes = 0;
  let utiles = 0;
  let superflues = 0;
  let exigeantes = 0;
  let atteintes = 0;
  let wTotal = 0;
  let wServi = 0;
  for (const cell of grid.cells) {
    if (cell.forbidden) continue;
    const r = redondance[cell.id] || 1;
    const n = tous[cell.id];
    const w = PRIORITY_WEIGHTS[cell.priorityLevel] ?? 1;
    wTotal += w;
    wServi += (w * Math.min(capables[cell.id], r)) / r;
    if (r >= 2) {
      exigeantes++;
      if (capables[cell.id] >= r) atteintes++;
    }
    if (n === 0) continue;
    couvertes++;
    if (n >= 2 && n <= r) utiles++;
    if (n > r) superflues++;
  }
  return {
    usefulOverlap: couvertes ? utiles / couvertes : 0,
    superfluousOverlap: couvertes ? superflues / couvertes : 0,
    redundancyMet: exigeantes ? atteintes / exigeantes : 1,
    weightedCoverage: wTotal ? wServi / wTotal : 0,
  };
}

export function couchesRedondance(
  grid: Grid,
  assignments: Assignment[],
  redondance: Uint8Array,
  opts: MetricsOptions = {},
): CouchesRedondance {
  const { index, tous, capables } = compter(grid, assignments, opts);
  const r = (id: number) => redondance[id] || 1;
  const ouverte = (id: number) => !grid.cells[id].forbidden;
  return {
    phase: grid.phase,
    redundancyMissing: fusionner(
      grid,
      index,
      (id) => ouverte(id) && r(id) >= 2 && capables[id] < r(id),
    ),
    superfluousOverlap: fusionner(grid, index, (id) => ouverte(id) && tous[id] > r(id)),
  };
}
