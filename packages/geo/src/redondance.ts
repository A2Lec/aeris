/**
 * Redondance : une zone prioritaire peut exiger r drones en même temps (r fixé par
 * l'utilisateur, 1 par défaut). Sur chaque cellule on compare r au nombre n de drones qui la
 * voient AU MÊME MOMENT : deux drones dont les créneaux (`slot`) ne se recouvrent pas se
 * relaient, ils ne comptent pas comme deux. Un drone sans créneau vole toute la phase.
 *   - chevauchement utile    : 2 ≤ n ≤ r (les drones voulus en plus du premier) ;
 *   - chevauchement superflu : n > r (le seul que le solveur doit chercher à réduire) ;
 *   - redondance atteinte    : n drones capables ≥ r, sur les cellules où r ≥ 2 ;
 *   - couverture pondérée    : crédit partiel min(n, r) / r du poids de la cellule.
 * Avec r = 1 partout et sans créneaux, on retrouve exactement overlap et weightedCoverage de
 * computeMetrics.
 */
import { booleanPointInPolygon } from '@turf/turf';
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
  /** Part de la surface couverte vue par 2 à r drones en même temps (chevauchement voulu). 0..1. */
  usefulOverlap: number;
  /** Part de la surface couverte vue par plus de r drones en même temps. 0..1. */
  superfluousOverlap: number;
  /** Part des cellules exigeant r ≥ 2 qui ont r drones capables en même temps. 1 s'il n'y en a pas. */
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

type Intervalle = [debut: string, fin: string];

/** Sans créneau : toute la phase. Les bornes se comparent comme des chaînes ISO. */
const TOUTE_LA_PHASE: Intervalle = ['', '\uffff'];
const intervalle = (a: Assignment): Intervalle =>
  a.slot ? [a.slot.start, a.slot.end] : TOUTE_LA_PHASE;

/**
 * Plus grand nombre d'intervalles ouverts qui se recouvrent à un même instant (balayage).
 * Deux créneaux qui se touchent (fin de l'un = début de l'autre) ne se recouvrent pas.
 */
export function maxSimultanes(intervalles: Intervalle[]): number {
  const evts: [string, number][] = [];
  for (const [d, f] of intervalles) if (d < f) evts.push([d, 1], [f, -1]);
  evts.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]));
  let courant = 0;
  let max = 0;
  for (const [, delta] of evts) {
    courant += delta;
    max = Math.max(max, courant);
  }
  return max;
}

/**
 * Par cellule non interdite : n = drones présents en même temps (au pire moment), et
 * n capables = idem parmi ceux qui ont les capacités requises (canServe).
 */
function compter(grid: Grid, assignments: Assignment[], opts: MetricsOptions) {
  const index = indexerGrille(grid);
  const tous = new Uint16Array(grid.cells.length);
  const capables = new Uint16Array(grid.cells.length);
  const sert = (a: Assignment, cell: Grid['cells'][number]) =>
    !opts.canServe || opts.canServe(a.resourceId, cell);

  if (!assignments.some((a) => a.slot)) {
    // Cas courant, sans créneaux : tout le monde vole en même temps, un simple comptage suffit.
    for (const a of assignments) {
      pourChaqueCelluleAPortee(grid, index, a.position.coordinates, a.radiusM, (cell) => {
        tous[cell.id]++;
        if (sert(a, cell)) capables[cell.id]++;
      });
    }
    return { index, tous, capables };
  }

  const presents: Intervalle[][] = grid.cells.map(() => []);
  const presentsCapables: Intervalle[][] = grid.cells.map(() => []);
  for (const a of assignments) {
    pourChaqueCelluleAPortee(grid, index, a.position.coordinates, a.radiusM, (cell) => {
      presents[cell.id].push(intervalle(a));
      if (sert(a, cell)) presentsCapables[cell.id].push(intervalle(a));
    });
  }
  for (let i = 0; i < grid.cells.length; i++) {
    tous[i] = maxSimultanes(presents[i]);
    capables[i] = maxSimultanes(presentsCapables[i]);
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
export function verifierRedondance(
  mission: Mission,
  catalog: DroneModel[],
  redondances: RedondanceParZone,
): string[] {
  const messages: string[] = [];
  const modeles = new Map(catalog.map((m) => [m.id, m]));
  for (const zone of mission.priorityZones) {
    const r = redondances[zone.id] ?? 1;
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
