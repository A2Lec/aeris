import { describe, expect, it } from 'vitest';
import { makeAssignment } from '@aeris/contracts';
import { Mission, type PolygonGeom } from '@aeris/shared';
import { communesConcernees, type ContourCommune } from './communes';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';

const rect = (o: number, s: number, e: number, n: number): PolygonGeom => ({
  type: 'Polygon',
  coordinates: [
    [
      [o, s],
      [e, s],
      [e, n],
      [o, n],
      [o, s],
    ],
  ],
});

const mission = Mission.parse({
  id: 'c',
  name: 'c',
  maxDrones: 5,
  pilots: [],
  resources: [],
  workArea: rect(1.18, 43.62, 1.28, 43.665),
});
const grid = buildGrid(mission, 0);
/** Deux communes qui se partagent la zone, une troisième en dehors. */
const communes: ContourCommune[] = [
  { code: '31001', nom: 'Ouestville', contour: rect(1.17, 43.61, 1.23, 43.67) },
  { code: '31002', nom: 'Estville', contour: rect(1.23, 43.61, 1.29, 43.67) },
  { code: '31999', nom: 'Loin', contour: rect(2, 44, 2.1, 44.1) },
];

describe('communesConcernees', () => {
  it('ne garde que les communes qui touchent la zone, et leurs surfaces font la zone', () => {
    const res = communesConcernees(grid, [], communes);
    expect(res.map((c) => c.code).sort()).toEqual(['31001', '31002']);
    const total = res.reduce((s, c) => s + c.areaM2, 0);
    expect(total).toBeCloseTo(grid.cells.length * grid.cellAreaM2, 6);
    expect(res.every((c) => c.coveredAreaM2 === 0)).toBe(true);
  });

  it('un drone à l’ouest : Ouestville en tête, surfaces couvertes = couverture totale', () => {
    const as = [makeAssignment('r1', [1.2, 43.64], 1000)];
    const res = communesConcernees(grid, as, communes);
    expect(res[0].nom).toBe('Ouestville');
    expect(res[0].coveredAreaM2).toBeGreaterThan(0);
    expect(res[1].coveredAreaM2).toBe(0);
    const couvert = res.reduce((s, c) => s + c.coveredAreaM2, 0);
    expect(couvert).toBeCloseTo(computeMetrics(grid, as).coveredAreaM2, 6);
  });
});
