import { describe, expect, it } from 'vitest';
import type { Assignment } from '@aeris/shared';
import { applyMoves, moveKey, movedOriginals } from './draft';

const at = (resourceId: string, phase: number, coordinates: [number, number]): Assignment => ({
  resourceId,
  phase,
  position: { type: 'Point', coordinates },
  radiusM: 1000,
  altitude: { minM: 30, maxM: 50 },
});

describe('brouillon de retouche', () => {
  const assignments = [at('R1', 0, [1, 43]), at('R1', 1, [1, 43]), at('R2', 0, [2, 44])];

  it('déplace seulement le couple de la phase visée', () => {
    const moved = applyMoves(assignments, { [moveKey('R1', 1)]: [1.5, 43.5] });
    expect(moved.map((a) => a.position.coordinates)).toEqual([
      [1, 43],
      [1.5, 43.5],
      [2, 44],
    ]);
  });

  it('ne modifie pas les affectations reçues', () => {
    applyMoves(assignments, { [moveKey('R2', 0)]: [9, 9] });
    expect(assignments[2].position.coordinates).toEqual([2, 44]);
  });

  it('sans déplacement, renvoie les mêmes positions', () => {
    expect(applyMoves(assignments, {})).toEqual(assignments);
  });

  it("retrouve les positions d'origine des couples déplacés", () => {
    const originals = movedOriginals(assignments, { [moveKey('R1', 0)]: [5, 5] });
    expect(originals).toEqual([assignments[0]]);
  });
});
