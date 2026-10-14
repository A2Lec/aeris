import { describe, expect, it } from 'vitest';
import { makeAssignment } from '@aeris/contracts';
import { Mission, type LngLat } from '@aeris/shared';
import { M_PER_DEG_LAT } from './distance';
import { buildGrid } from './grid';
import { mesurerStabilite } from './stabilite';

/** Zone de 8 × 5 km avec une zone prioritaire à l'ouest. */
const mission = Mission.parse({
  id: 's',
  name: 's',
  maxDrones: 5,
  pilots: [],
  resources: [],
  workArea: {
    type: 'Polygon',
    coordinates: [
      [
        [1.18, 43.62],
        [1.28, 43.62],
        [1.28, 43.665],
        [1.18, 43.665],
        [1.18, 43.62],
      ],
    ],
  },
  priorityZones: [
    {
      id: 'zp',
      name: 'Bois ouest',
      level: 3,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1.19, 43.63],
            [1.21, 43.63],
            [1.21, 43.65],
            [1.19, 43.65],
            [1.19, 43.63],
          ],
        ],
      },
    },
  ],
});
const grid = buildGrid(mission, 0);

const ouest: LngLat = [1.2, 43.64];
const centre: LngLat = [1.23, 43.642];
const est: LngLat = [1.26, 43.645];
const nordDe = ([lng, lat]: LngLat, m: number): LngLat => [lng, lat + m / M_PER_DEG_LAT];

const dispositif = () => [
  makeAssignment('r1', ouest, 2000),
  makeAssignment('r2', centre, 1000),
  makeAssignment('r3', est, 1000),
];

describe('mesurerStabilite', () => {
  it('dispositif inchangé : rien ne bouge', () => {
    const s = mesurerStabilite(grid, dispositif(), dispositif());
    expect(s.moved).toEqual([]);
    expect(s.added).toEqual([]);
    expect(s.removed).toEqual([]);
    expect(s.totalShiftM).toBe(0);
    expect(s.reassignedShare).toBe(0);
    expect(Object.values(s.deltas).every((x) => x === 0)).toBe(true);
    expect(s.summary).toContain('Aucun couple déplacé');
  });

  it("l'ordre des affectations ne change rien", () => {
    const s = mesurerStabilite(grid, dispositif(), dispositif().reverse());
    expect(s.reassignedShare).toBe(0);
  });

  it('un couple retiré : couverture en baisse, ses cellules changent de responsable', () => {
    const s = mesurerStabilite(grid, dispositif(), dispositif().slice(0, 2));
    expect(s.removed).toEqual(['r3']);
    expect(s.deltas.coverage).toBeLessThan(0);
    expect(s.reassignedShare).toBeGreaterThan(0);
    expect(s.summary[0]).toContain('r3');
  });

  it('retirer le couple de la zone prioritaire fait chuter la couverture prioritaire', () => {
    const s = mesurerStabilite(grid, dispositif(), dispositif().slice(1));
    expect(s.deltas.priorityCoverage).toBeLessThan(-0.5);
  });

  it('un couple ajouté', () => {
    const s = mesurerStabilite(grid, dispositif().slice(0, 2), dispositif());
    expect(s.added).toEqual(['r3']);
    expect(s.deltas.coverage).toBeGreaterThan(0);
  });

  it('un déplacement sous le seuil est ignoré, au-dessus il est compté et mesuré', () => {
    const petit = dispositif();
    petit[1] = makeAssignment('r2', nordDe(centre, 30), 1000);
    expect(mesurerStabilite(grid, dispositif(), petit).moved).toEqual([]);

    const grand = dispositif();
    grand[1] = makeAssignment('r2', nordDe(centre, 500), 1000);
    const s = mesurerStabilite(grid, dispositif(), grand);
    expect(s.moved.map((d) => d.resourceId)).toEqual(['r2']);
    expect(s.maxShiftM).toBeCloseTo(500, 0);
    expect(s.reassignedShare).toBeGreaterThan(0);
  });

  it('le seuil se règle', () => {
    const grand = dispositif();
    grand[1] = makeAssignment('r2', nordDe(centre, 500), 1000);
    const s = mesurerStabilite(grid, dispositif(), grand, { minShiftM: 1000 });
    expect(s.moved).toEqual([]);
  });

  it("les affectations d'une autre phase sont ignorées", () => {
    const autre = [...dispositif(), makeAssignment('r9', centre, 2000, 1)];
    const s = mesurerStabilite(grid, dispositif(), autre);
    expect(s.added).toEqual([]);
    expect(s.reassignedShare).toBe(0);
  });

  it('sans aucun drone : tout à zéro, sans erreur', () => {
    const s = mesurerStabilite(grid, [], []);
    expect(s.reassignedShare).toBe(0);
    expect(s.maxShiftM).toBe(0);
  });
});
