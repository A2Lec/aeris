/**
 * Redondance : une zone prioritaire peut exiger r drones en même temps
 * (`PriorityZone.redundancy`, 1 par défaut ; `buildGrid` le reporte dans `cell.redundancy`). Sur chaque cellule on compare r au nombre n de drones qui la
 * voient en même temps, au pire moment de la phase (voir presence.ts) : deux drones qui se
 * relaient par créneaux ne comptent pas comme deux.
 *   - chevauchement utile    : 2 ≤ n ≤ r (les drones voulus en plus du premier) ;
 *   - chevauchement superflu : n > r (le seul que le solveur doit chercher à réduire) ;
 *   - redondance atteinte    : n drones capables ≥ r, sur les cellules où r ≥ 2 ;
 *   - couverture pondérée    : crédit partiel min(n, r) / r du poids de la cellule.
 * Avec r = 1 partout et sans créneaux, on retrouve exactement overlap et weightedCoverage de
 * computeMetrics. computeMetrics remplit lui-même usefulOverlap, superfluousOverlap et
 * redundancyMet ; seule la couverture à crédit partiel est propre à ce module.
 */
import {
  PRIORITY_WEIGHTS,
  meetsRequirement,
  type Assignment,
  type DroneModel,
  type Grid,
  type Mission,
  type MetricsOptions,
  type MultiPolygonGeom,
  type Requirement,
} from '@aeris/shared';
import { fusionner } from './coverage';
import { presenceAuPireMoment } from './presence';
import { indexerGrille } from './voisinage';

export interface IndicateursRedondance {
  /** Part de la surface couverte vue par 2 à r drones en même temps (chevauchement voulu). 0..1. */
  usefulOverlap: number;
  /** Part de la surface couverte vue par plus de r drones en même temps. 0..1. */
  superfluousOverlap: number;
  /** Part des cellules exigeant r ≥ 2 qui ont r drones capables en même temps. 1 s'il n'y en a pas. */
  redundancyMet: number;
  /** Couverture pondérée avec crédit partiel min(n, r) / r. 0..1. (≠ Metrics.weightedCoverage) */
  partialWeightedCoverage: number;
}

export interface CouchesRedondance {
  phase: number;
  /** Cellules exigeant r ≥ 2 qui ont moins de r drones capables (au moins un drone manque). */
  redundancyMissing: MultiPolygonGeom;
  /** Cellules vues par plus de r drones. */
  superfluousOverlap: MultiPolygonGeom;
}

/**
 * Par cellule non interdite, au pire moment de la phase : n = drones présents, n capables =
 * drones présents qui ont les capacités requises (canServe).
 */
function compter(grid: Grid, assignments: Assignment[], opts: MetricsOptions) {
  const index = indexerGrille(grid);
  return {
    index,
    tous: presenceAuPireMoment(grid, index, assignments),
    capables: presenceAuPireMoment(
      grid,
      index,
      assignments,
      (a, cell) => !opts.canServe || opts.canServe(a.resourceId, cell),
    ),
  };
}

export function mesurerRedondance(
  grid: Grid,
  assignments: Assignment[],
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
    const r = cell.redundancy;
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
    partialWeightedCoverage: wTotal ? wServi / wTotal : 0,
  };
}

export function couchesRedondance(
  grid: Grid,
  assignments: Assignment[],
  opts: MetricsOptions = {},
): CouchesRedondance {
  const { index, tous, capables } = compter(grid, assignments, opts);
  const r = (id: number) => grid.cells[id].redundancy;
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

/** Capacités exigées par une zone, en clair (« caméra thermique, zoom ×50 »). */
function capacitesEnClair(req: Requirement): string {
  const parties = [
    req.thermal ? 'caméra thermique' : '',
    req.night ? 'vol de nuit' : '',
    req.minZoomX ? `zoom ×${req.minZoomX}` : '',
  ].filter(Boolean);
  return parties.join(', ');
}

/**
 * Contrôle de saisie : une redondance demandée est-elle possible avec cette mission ?
 * Messages bloquants, vide si tout est possible. Vérifie le plafond de l'arrêté et le nombre
 * de couples disponibles dont le drone a les capacités exigées par la zone. Ne vérifie pas
 * l'étagement en hauteur ni les zones limites des couples : c'est au solveur de le dire.
 */
export function verifierRedondance(mission: Mission, catalog: DroneModel[]): string[] {
  const messages: string[] = [];
  const modeles = new Map(catalog.map((m) => [m.id, m]));
  for (const zone of mission.priorityZones) {
    const r = zone.redundancy;
    if (!Number.isInteger(r) || r < 1) {
      messages.push(
        `${zone.name} : nombre de drones voulus invalide (${r}), il faut un entier ≥ 1.`,
      );
      continue;
    }
    if (r === 1) continue;
    if (r > mission.maxDrones) {
      messages.push(
        `${zone.name} : ${r} drones voulus, l'arrêté en autorise ${mission.maxDrones} au total.`,
      );
    }
    const capables = mission.resources.filter((res) => {
      const modele = modeles.get(res.droneModelId);
      return res.available && !!modele && meetsRequirement(modele, zone.requires);
    });
    if (capables.length < r) {
      const exigences = capacitesEnClair(zone.requires);
      const liste = capables.length ? ` (${capables.map((c) => c.id).join(', ')})` : '';
      messages.push(
        `${zone.name} : ${r} drones voulus${exigences ? ` avec ${exigences}` : ''}, ` +
          `la mission en a ${capables.length} disponible(s)${liste}.`,
      );
    }
  }
  return messages;
}
