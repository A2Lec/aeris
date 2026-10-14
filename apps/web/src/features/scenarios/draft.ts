import type { Assignment } from '@aeris/shared';

/**
 * Brouillon de retouche : l'opérateur déplace des pilotes sur la carte, puis décide
 * de recalculer (ou d'annuler). Un même couple peut avoir une position par phase.
 */
export const moveKey = (resourceId: string, phase: number) => `${resourceId}:${phase}`;

/** Affectations avec les positions du brouillon appliquées (les autres sont inchangées). */
export function applyMoves(
  assignments: Assignment[],
  moves: Record<string, [number, number]>,
): Assignment[] {
  return assignments.map((a) => {
    const lngLat = moves[moveKey(a.resourceId, a.phase)];
    return lngLat ? { ...a, position: { type: 'Point', coordinates: lngLat } } : a;
  });
}

/** Affectations d'origine dont la position a été déplacée dans le brouillon. */
export function movedOriginals(
  assignments: Assignment[],
  moves: Record<string, [number, number]>,
): Assignment[] {
  return assignments.filter((a) => moves[moveKey(a.resourceId, a.phase)] !== undefined);
}
