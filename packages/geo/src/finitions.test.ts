import { describe, expect, it } from 'vitest';
import { areaM2, makeAssignment } from '@aeris/contracts';
import { Mission, type Assignment, type LngLat, type PolygonGeom } from '@aeris/shared';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';
import { couchesParCouple } from './parCouple';
import { mesurerStabilite } from './stabilite';
import { couvertureParZone } from './zones';

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
  id: 'f',
  name: 'f',
  maxDrones: 5,
  phaseCount: 2,
  pilots: [],
  resources: [],
  workArea: rect(1.18, 43.62, 1.28, 43.665),
  priorityZones: [
    { id: 'bois', name: 'Bois ouest', level: 3, geometry: rect(1.19, 43.63, 1.21, 43.65) },
    {
      id: 'etang',
      name: 'Étang',
      level: 1,
      phases: [1],
      geometry: rect(1.225, 43.638, 1.235, 43.643),
    },
    { id: 'pylone', name: 'Pylône', level: 2, geometry: rect(1.25, 43.64, 1.2502, 43.6402) },
  ],
  constraintZones: [
    { id: 'i', name: 'interdite', kind: 'interdite', geometry: rect(1.27, 43.62, 1.28, 43.63) },
  ],
});
const grid = buildGrid(mission, 0);
const ouest: LngLat = [1.2, 43.64];
const est: LngLat = [1.26, 43.645];
const deux = [makeAssignment('r1', ouest, 2000), makeAssignment('r2', est, 1000)];

describe('couchesParCouple', () => {
  it('chaque cellule couverte appartient à un seul couple : les surfaces font la couverture', () => {
    const couches = couchesParCouple(grid, deux);
    expect(couches.map((c) => c.resourceId)).toEqual(['r1', 'r2']);
    const total = couches.reduce((s, c) => s + c.areaM2, 0);
    expect(total).toBeCloseTo(computeMetrics(grid, deux).coveredAreaM2, 6);
    for (const c of couches) {
      expect(Math.abs(areaM2(c.geometry) - c.areaM2)).toBeLessThanOrEqual(
        Math.max(grid.cellAreaM2, 0.01 * c.areaM2),
      );
    }
  });

  it("l'ordre des affectations ne change pas qui couvre quoi", () => {
    const a = couchesParCouple(grid, deux);
    const b = couchesParCouple(grid, [...deux].reverse());
    expect(b.find((c) => c.resourceId === 'r1')!.areaM2).toBe(a[0].areaM2);
  });

  it('deux couples au même endroit : à égalité, le plus petit identifiant a tout', () => {
    const doublon = [makeAssignment('b', ouest, 2000), makeAssignment('a', ouest, 500)];
    const [b, a] = couchesParCouple(grid, doublon);
    expect(a.areaM2).toBeGreaterThan(0);
    expect(b.areaM2).toBeGreaterThan(0); // l'anneau entre 500 m et 2 km n'est vu que par b
    const memeRayon = couchesParCouple(grid, [
      makeAssignment('b', ouest, 1000),
      makeAssignment('a', ouest, 1000),
    ]);
    expect(memeRayon.find((c) => c.resourceId === 'b')!.areaM2).toBe(0);
  });
});

describe('couvertureParZone', () => {
  it('ne liste que les zones actives de la phase', () => {
    expect(couvertureParZone(mission, grid, deux).map((z) => z.zoneId)).toEqual(['bois', 'pylone']);
    expect(couvertureParZone(mission, buildGrid(mission, 1), deux).map((z) => z.zoneId)).toEqual([
      'bois',
      'etang',
      'pylone',
    ]);
  });

  it('bois entièrement sous un TP2 : 100 % ; sans drone : 0 %', () => {
    const [bois] = couvertureParZone(mission, grid, deux);
    expect(bois.coverage).toBe(1);
    expect(bois.served).toBe(1);
    expect(couvertureParZone(mission, grid, [])[0].coverage).toBe(0);
  });

  it('drone sans les capacités : couvert mais pas servi', () => {
    const [bois] = couvertureParZone(mission, grid, deux, { canServe: () => false });
    expect(bois.coverage).toBe(1);
    expect(bois.served).toBe(0);
  });

  it('une zone plus petite qu’une cellule est signalée par 0 cellule', () => {
    const pylone = couvertureParZone(mission, grid, deux).find((z) => z.zoneId === 'pylone')!;
    expect(pylone.cells).toBe(0);
  });
});

describe('stabilité au pire moment', () => {
  it('passer un drone en créneau partiel fait baisser la couverture, sans déplacement', () => {
    const avecCreneau: Assignment[] = [
      { ...deux[0], slot: { start: '10:00', end: '11:00' } },
      { ...deux[1], slot: { start: '10:00', end: '12:00' } },
    ];
    const s = mesurerStabilite(grid, deux, avecCreneau);
    expect(s.deplaces).toEqual([]);
    expect(s.ecarts.coverage).toBeLessThan(0);
  });
});
