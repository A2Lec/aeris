/**
 * Stabilité après un changement : ce qui bouge entre le dispositif en place et le dispositif
 * proposé par un recalcul, pour une même phase. Le brief demande un recalcul qui « limite les
 * changements inutiles » ; cette mesure permet de le montrer au commandant avant qu'il valide.
 *
 * Responsable d'une cellule : même règle que la carte « qui couvre quoi » (parCouple.ts).
 */
import type { StabilityEngine } from '@aeris/shared';
import { distanceM } from './distance';
import { computeMetrics } from './metrics';
import { responsables } from './parCouple';
import { indexerGrille } from './voisinage';

const points = (x: number) =>
  `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)} pts`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Les affectations d'une autre phase que celle de la grille sont ignorées. */
export const mesurerStabilite: StabilityEngine = (grid, avant, apres, opts = {}) => {
  const seuil = opts.minShiftM ?? 50;
  const av = avant.filter((a) => a.phase === grid.phase);
  const ap = apres.filter((a) => a.phase === grid.phase);
  const parId = new Map(av.map((a) => [a.resourceId, a]));
  const idsApres = new Set(ap.map((a) => a.resourceId));

  const deplaces: { resourceId: string; shiftM: number }[] = [];
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
      deplaces.push({ resourceId: a.resourceId, shiftM: d });
      distanceTotaleM += d;
    }
  }
  deplaces.sort((x, y) => y.shiftM - x.shiftM || x.resourceId.localeCompare(y.resourceId));
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
    moved: deplaces,
    totalShiftM: distanceTotaleM,
    maxShiftM: deplaces[0]?.shiftM ?? 0,
    added: ajoutes,
    removed: retires,
    deltas: ecarts,
    reassignedShare: cellulesReattribuees,
    summary: resume,
  };
};
