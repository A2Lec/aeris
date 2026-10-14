/**
 * Présence au pire moment : quand la séparation temporelle fait alterner des drones (`slot`),
 * une cellule n'est pas vue en permanence. On compte, pour chaque cellule, le nombre de drones
 * présents au moment le moins favorable de la phase. C'est le chiffre prudent : « à tout
 * instant, au moins n drones voient cette cellule ».
 *
 * La phase est bornée par le premier début et la dernière fin des créneaux ; un drone sans
 * créneau est présent toute la phase. Sans aucun créneau, c'est un simple comptage.
 */
import type { Assignment, Cell, Grid } from '@aeris/shared';
import { pourChaqueCelluleAPortee, type IndexGrille } from './voisinage';

/** Bornes des intervalles élémentaires de la phase (chaînes ISO, triées, sans doublon). */
function bornesDeLaPhase(assignments: Assignment[]): string[] {
  const bornes = new Set<string>();
  for (const a of assignments) {
    if (a.slot && a.slot.start < a.slot.end) bornes.add(a.slot.start).add(a.slot.end);
  }
  return [...bornes].sort();
}

/**
 * Nombre de drones présents au pire moment, par cellule non interdite (index = cell.id).
 * `garde` filtre les drones qui comptent pour une cellule (ex. capacités requises).
 */
export function presenceAuPireMoment(
  grid: Grid,
  index: IndexGrille,
  assignments: Assignment[],
  garde: (a: Assignment, cell: Cell) => boolean = () => true,
): Uint16Array {
  const n = grid.cells.length;
  const bornes = bornesDeLaPhase(assignments);

  if (bornes.length < 2) {
    const counts = new Uint16Array(n);
    for (const a of assignments) {
      pourChaqueCelluleAPortee(grid, index, a.position.coordinates, a.radiusM, (cell) => {
        if (garde(a, cell)) counts[cell.id]++;
      });
    }
    return counts;
  }

  // Intervalle élémentaire k = ]bornes[k], bornes[k+1][ : chaque créneau le contient en entier
  // ou pas du tout, puisque toutes ses bornes sont dans la liste.
  const k = bornes.length - 1;
  const parInstant = new Uint16Array(n * k);
  for (const a of assignments) {
    const present = Array.from(
      { length: k },
      (_, i) => !a.slot || (a.slot.start <= bornes[i] && bornes[i + 1] <= a.slot.end),
    );
    if (!present.some(Boolean)) continue;
    pourChaqueCelluleAPortee(grid, index, a.position.coordinates, a.radiusM, (cell) => {
      if (!garde(a, cell)) return;
      for (let i = 0; i < k; i++) if (present[i]) parInstant[cell.id * k + i]++;
    });
  }

  const counts = new Uint16Array(n);
  for (let c = 0; c < n; c++) {
    let min = Infinity;
    for (let i = 0; i < k; i++) min = Math.min(min, parInstant[c * k + i]);
    counts[c] = min;
  }
  return counts;
}
