/**
 * Stabilité après un changement : ce qui bouge entre le dispositif en place et le dispositif
 * proposé par un recalcul, pour une même phase. Le brief demande un recalcul qui « limite les
 * changements inutiles » ; cette mesure permet de le montrer au commandant avant qu'il valide.
 *
 * Responsable d'une cellule : le couple le plus proche parmi ceux qui la couvrent (à égalité,
 * le plus petit identifiant), pour que le résultat ne dépende pas de l'ordre des affectations.
 */
import type { Assignment, Grid, Metrics, MetricsOptions } from '@aeris/shared';
import { distanceM } from './distance';
import { computeMetrics } from './metrics';
import { indexerGrille, pourChaqueCelluleAPortee, type IndexGrille } from './voisinage';

// TODO(P1) : déplacer `Stabilite` dans @aeris/shared (schéma zod, à côté de Metrics) et
// `StabilityEngine` dans engines.ts. Types déclarés ici en attendant, pour ne pas toucher shared.

export interface Deplacement {
  resourceId: string;
  distanceM: number;
}

export interface Stabilite {
  phase: number;
  /** Couples dont la position a bougé de plus que le seuil, du plus grand déplacement au plus petit. */
  deplaces: Deplacement[];
  distanceTotaleM: number;
  distanceMaxM: number;
  /** Présents seulement dans le dispositif proposé. */
  ajoutes: string[];
  /** Présents seulement dans le dispositif en place (renoncement, TP indisponible…). */
  retires: string[];
  /** Après − avant, en points de ratio (−0,11 = −11 points). */
  ecarts: Pick<Metrics, 'coverage' | 'priorityCoverage' | 'weightedCoverage' | 'overlap'>;
  /**
   * Part des cellules couvertes avant ou après dont le couple responsable n'est plus le même
   * (y compris les cellules devenues non couvertes ou nouvellement couvertes). 0..1.
   */
  cellulesReattribuees: number;
  /** Phrases courtes pour le commandant, dans l'ordre d'importance. */
  resume: string[];
}

export interface StabiliteOptions extends MetricsOptions {
  /** En dessous, un couple n'est pas compté comme déplacé (arrondi du solveur). Défaut : 50 m. */
  seuilDeplacementM?: number;
}

export type StabilityEngine = (
  grid: Grid,
  avant: Assignment[],
  apres: Assignment[],
  opts?: StabiliteOptions,
) => Stabilite;

/** Index (dans `assignments`) du couple responsable de chaque cellule, -1 si non couverte. */
function responsables(grid: Grid, index: IndexGrille, assignments: Assignment[]): Int32Array {
  const resp = new Int32Array(grid.cells.length).fill(-1);
  const dist = new Float64Array(grid.cells.length).fill(Infinity);
  assignments.forEach((a, i) => {
    const p = a.position.coordinates;
    pourChaqueCelluleAPortee(grid, index, p, a.radiusM, (cell) => {
      const d = distanceM(p, cell.center);
      const actuel = resp[cell.id];
      if (
        d < dist[cell.id] ||
        (d === dist[cell.id] && a.resourceId < assignments[actuel].resourceId)
      ) {
        dist[cell.id] = d;
        resp[cell.id] = i;
      }
    });
  });
  return resp;
}

const points = (x: number) =>
  `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)} pts`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Les affectations d'une autre phase que celle de la grille sont ignorées. */
export const mesurerStabilite: StabilityEngine = (grid, avant, apres, opts = {}) => {
  const seuil = opts.seuilDeplacementM ?? 50;
  const av = avant.filter((a) => a.phase === grid.phase);
  const ap = apres.filter((a) => a.phase === grid.phase);
  const parId = new Map(av.map((a) => [a.resourceId, a]));
  const idsApres = new Set(ap.map((a) => a.resourceId));

  const deplaces: Deplacement[] = [];
  let distanceTotaleM = 0;
  const ajoutes: string[] = [];
  for (const a of ap) {
    const ancien = parId.get(a.resourceId);
    if (!ancien) {
      ajoutes.push(a.resourceId);
      continue;
    }
    const d = distanceM(ancien.position.coordinates, a.position.coordinates);
    if (d > seuil) {
      deplaces.push({ resourceId: a.resourceId, distanceM: d });
      distanceTotaleM += d;
    }
  }
  deplaces.sort((x, y) => y.distanceM - x.distanceM || x.resourceId.localeCompare(y.resourceId));
  const retires = av.filter((a) => !idsApres.has(a.resourceId)).map((a) => a.resourceId);
  ajoutes.sort();
  retires.sort();

  const index = indexerGrille(grid);
  const respAvant = responsables(grid, index, av);
  const respApres = responsables(grid, index, ap);
  let couvertes = 0;
  let changees = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    const idAvant = respAvant[i] >= 0 ? av[respAvant[i]].resourceId : null;
    const idApres = respApres[i] >= 0 ? ap[respApres[i]].resourceId : null;
    if (idAvant === null && idApres === null) continue;
    couvertes++;
    if (idAvant !== idApres) changees++;
  }

  const mAvant = computeMetrics(grid, av, opts);
  const mApres = computeMetrics(grid, ap, opts);
  const ecarts = {
    coverage: mApres.coverage - mAvant.coverage,
    priorityCoverage: mApres.priorityCoverage - mAvant.priorityCoverage,
    weightedCoverage: mApres.weightedCoverage - mAvant.weightedCoverage,
    overlap: mApres.overlap - mAvant.overlap,
  };
  const cellulesReattribuees = couvertes ? changees / couvertes : 0;

  const resume: string[] = [];
  if (retires.length) resume.push(`${retires.length} couple(s) retiré(s) : ${retires.join(', ')}`);
  if (ajoutes.length) resume.push(`${ajoutes.length} couple(s) ajouté(s) : ${ajoutes.join(', ')}`);
  resume.push(
    deplaces.length
      ? `${deplaces.length} couple(s) déplacé(s), ${Math.round(distanceTotaleM)} m au total`
      : 'Aucun couple déplacé',
  );
  resume.push(
    `Couverture prioritaire : ${pct(mAvant.priorityCoverage)} → ${pct(mApres.priorityCoverage)} (${points(ecarts.priorityCoverage)})`,
    `Couverture totale : ${pct(mAvant.coverage)} → ${pct(mApres.coverage)} (${points(ecarts.coverage)})`,
    `${pct(cellulesReattribuees)} de la zone couverte change de responsable`,
  );

  return {
    phase: grid.phase,
    deplaces,
    distanceTotaleM,
    distanceMaxM: deplaces[0]?.distanceM ?? 0,
    ajoutes,
    retires,
    ecarts,
    cellulesReattribuees,
    resume,
  };
};
