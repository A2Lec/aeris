import { describe, expect, it } from 'vitest';
import { buildGrid } from '@aeris/geo';
import type { Assignment, DeconflictContext, DroneModel, Mission, PilotRule } from '@aeris/shared';
import {
  deconflict,
  detectConflicts,
  FLOOR_M,
  horizontalOverlap,
  slotsOverlap,
  verticalOverlap,
} from './index';

const testMission: Mission = {
  id: 'm-test',
  name: 'Mission Test Deconflict',
  workArea: {
    type: 'Polygon',
    coordinates: [
      [
        [1.2, 43.6],
        [1.3, 43.6],
        [1.3, 43.7],
        [1.2, 43.7],
        [1.2, 43.6],
      ],
    ],
  },
  environment: 'rural',
  maxDrones: 10,
  phaseCount: 1,
  gridCellM: 100,
  pilots: [
    { id: 'p1', name: 'Pilote 1', level: 'TP2' },
    { id: 'p2', name: 'Pilote 2', level: 'TP1' },
    { id: 'p3', name: 'Pilote 3', level: 'TP1' },
    { id: 'p4', name: 'Pilote 4', level: 'TP1' },
  ],
  resources: [
    { id: 'r1', pilotId: 'p1', droneModelId: 'd-tp2', available: true },
    { id: 'r2', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
    { id: 'r3', pilotId: 'p3', droneModelId: 'd-tp1', available: true },
    { id: 'r4', pilotId: 'p4', droneModelId: 'd-tp1', available: true },
  ],
  priorityZones: [],
  constraintZones: [],
};

const testCatalog: DroneModel[] = [
  {
    id: 'd-tp2',
    name: 'Drone TP2',
    enduranceMin: 45,
    maxWindMs: 15,
    rainOk: true,
    minTempC: -20,
    maxTempC: 50,
    zoomX: 56,
    thermal: true,
    night: true,
  },
  {
    id: 'd-tp1',
    name: 'Drone TP1',
    enduranceMin: 35,
    maxWindMs: 10,
    rainOk: false,
    minTempC: -10,
    maxTempC: 40,
    zoomX: 10,
    thermal: false,
    night: false,
  },
];

const testRules: PilotRule[] = [
  { level: 'TP1', scenario: '2.2 hors vue', rangeM: 1000, maxHeightM: { rural: 50, urbain: 80 } },
  { level: 'TP2', scenario: '2.2 hors vue', rangeM: 2000, maxHeightM: { rural: 120, urbain: 120 } },
];

function makeCtx(patchMission: Partial<Mission> = {}): DeconflictContext {
  const mission = { ...testMission, ...patchMission };
  return {
    mission,
    catalog: testCatalog,
    rules: testRules,
    grid: buildGrid(mission, 0),
    phase: 0,
  };
}

function makeDroneAssignment(
  id: string,
  coords: [number, number],
  radiusM = 1000,
  maxM = 120,
): Assignment {
  return {
    resourceId: id,
    phase: 0,
    position: { type: 'Point', coordinates: coords },
    radiusM,
    altitude: { minM: 0, maxM },
  };
}

describe('Fonctions géométriques et temporelles', () => {
  it('détecte correctement le chevauchement horizontal', () => {
    const a = makeDroneAssignment('d1', [1.25, 43.65], 1000);
    const b = makeDroneAssignment('d2', [1.255, 43.65], 1000); // ~400 m de distance
    const c = makeDroneAssignment('d3', [1.35, 43.65], 1000); // ~8 km de distance

    expect(horizontalOverlap(a, b)).toBe(true);
    expect(horizontalOverlap(a, c)).toBe(false);
  });

  it('ne considère pas de conflit horizontal si les deux ont un secteur distinct', () => {
    const a: Assignment = {
      ...makeDroneAssignment('d1', [1.25, 43.65], 1000),
      sector: {
        type: 'Polygon',
        coordinates: [
          [
            [1.24, 43.64],
            [1.26, 43.64],
            [1.26, 43.66],
            [1.24, 43.66],
            [1.24, 43.64],
          ],
        ],
      },
    };
    const b: Assignment = {
      ...makeDroneAssignment('d2', [1.25, 43.65], 1000),
      sector: {
        type: 'Polygon',
        coordinates: [
          [
            [1.26, 43.64],
            [1.28, 43.64],
            [1.28, 43.66],
            [1.26, 43.66],
            [1.26, 43.64],
          ],
        ],
      },
    };
    expect(horizontalOverlap(a, b)).toBe(false);
  });

  it('détecte correctement le chevauchement vertical', () => {
    expect(verticalOverlap({ minM: 10, maxM: 30 }, { minM: 30, maxM: 50 })).toBe(false);
    expect(verticalOverlap({ minM: 10, maxM: 35 }, { minM: 30, maxM: 50 })).toBe(true);
  });

  it('gère le non-chevauchement des créneaux temporels', () => {
    const s1 = { start: '2026-10-14T08:00:00Z', end: '2026-10-14T09:00:00Z' };
    const s2 = { start: '2026-10-14T09:00:00Z', end: '2026-10-14T10:00:00Z' };
    const s3 = { start: '2026-10-14T08:30:00Z', end: '2026-10-14T09:30:00Z' };

    expect(slotsOverlap(s1, s2)).toBe(false);
    expect(slotsOverlap(s1, s3)).toBe(true);
    expect(slotsOverlap(undefined, s1)).toBe(true);
  });
});

describe('Doctrine de séparation en cascade V1', () => {
  it('Niveau 1 Horizontal : deux drones éloignés volent sans contrainte à leur altitude max', () => {
    const ctx = makeCtx();
    const a = makeDroneAssignment('r1', [1.22, 43.62], 1000, 120);
    const b = makeDroneAssignment('r2', [1.28, 43.68], 1000, 120);

    const res = deconflict([a, b], ctx);
    expect(res.assignments).toHaveLength(2);
    expect(res.conflicts).toHaveLength(0);
    expect(res.assignments[0].slot).toBeUndefined();
    expect(res.assignments[1].slot).toBeUndefined();
    expect(res.assignments[0].altitude.maxM).toBe(120);
    expect(res.assignments[1].altitude.maxM).toBe(120);
  });

  it('Niveau 2 Vertical : tranches adaptatives sous plafond bas', () => {
    const ctx = makeCtx();
    const point: [number, number] = [1.25, 43.65];
    // 4 drones au même point sous plafond 50 m (40 m d'espace disponible de 10 m à 50 m)
    const inputs = [
      makeDroneAssignment('r1', point, 1000, 50),
      makeDroneAssignment('r2', point, 1000, 50),
      makeDroneAssignment('r3', point, 1000, 50),
      makeDroneAssignment('r4', point, 1000, 50),
    ];

    const res = deconflict(inputs, ctx);
    expect(res.assignments).toHaveLength(4);

    // Les 4 drones doivent avoir des tranches d'altitude disjointes >= 10 m sans créneau temporel
    for (const a of res.assignments) {
      expect(a.slot).toBeUndefined();
      expect(a.altitude.maxM - a.altitude.minM).toBeGreaterThanOrEqual(10);
      expect(a.altitude.maxM).toBeLessThanOrEqual(50);
      expect(a.altitude.minM).toBeGreaterThanOrEqual(FLOOR_M);
    }

    // Vérifier l'absence totale de conflit résiduel
    expect(detectConflicts(res.assignments)).toHaveLength(0);
  });

  it('Niveau 3 Temporel : saturation verticale -> séparation en créneaux temporels', () => {
    // 6 drones au même point sous plafond 50 m : 6 drones ne peuvent pas avoir 10 m chacun dans 40 m
    const ctx = makeCtx({
      resources: [
        { id: 'r1', pilotId: 'p1', droneModelId: 'd-tp1', available: true },
        { id: 'r2', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
        { id: 'r3', pilotId: 'p3', droneModelId: 'd-tp1', available: true },
        { id: 'r4', pilotId: 'p4', droneModelId: 'd-tp1', available: true },
        { id: 'r5', pilotId: 'p4', droneModelId: 'd-tp1', available: true },
        { id: 'r6', pilotId: 'p4', droneModelId: 'd-tp1', available: true },
      ],
    });
    const point: [number, number] = [1.25, 43.65];
    const inputs = [
      makeDroneAssignment('r1', point, 1000, 50),
      makeDroneAssignment('r2', point, 1000, 50),
      makeDroneAssignment('r3', point, 1000, 50),
      makeDroneAssignment('r4', point, 1000, 50),
      makeDroneAssignment('r5', point, 1000, 50),
      makeDroneAssignment('r6', point, 1000, 50),
    ];

    const res = deconflict(inputs, ctx);
    expect(res.assignments).toHaveLength(6);

    // Tous les drones ont reçu un créneau temporel
    for (const a of res.assignments) {
      expect(a.slot).toBeDefined();
      expect(a.slot!.start < a.slot!.end).toBe(true);
    }

    // Vérifier la traçabilité des conflits séparés par créneau temporel
    expect(res.conflicts.some((c) => c.resolvedBy === 'temporel')).toBe(true);
    // Aucun conflit résiduel 4D
    expect(detectConflicts(res.assignments)).toHaveLength(0);
  });

  it('Niveau 4 Renoncement : saturation totale de la capacité verticale et temporelle', () => {
    const point: [number, number] = [1.25, 43.65];
    const resources = [];
    const inputs: Assignment[] = [];
    for (let i = 1; i <= 10; i++) {
      resources.push({ id: `drone-${i}`, pilotId: 'p2', droneModelId: 'd-tp1', available: true });
      inputs.push(makeDroneAssignment(`drone-${i}`, point, 1000, 50));
    }
    const ctx = makeCtx({ resources });

    const res = deconflict(inputs, ctx);
    // 8 drones placés au maximum, 2 renoncés
    expect(res.assignments).toHaveLength(8);

    // Diagnostics explicites pour chaque drone renoncé
    expect(res.diagnostics.some((d) => d.includes('renoncement pour saturation'))).toBe(true);
    expect(res.conflicts.some((c) => c.resolvedBy === 'renoncement')).toBe(true);

    // Vérifier que chaque drone non conservé est explicitement nommé dans les diagnostics
    const keptIds = new Set(res.assignments.map((a) => a.resourceId));
    for (const input of inputs) {
      if (!keptIds.has(input.resourceId)) {
        expect(res.diagnostics.some((d) => d.includes(input.resourceId))).toBe(true);
      }
    }

    // Aucun conflit résiduel entre les drones restants
    expect(detectConflicts(res.assignments)).toHaveLength(0);
  });

  it('Niveau 4 Renoncement immédiat si plafond local inférieur au plancher de sécurité', () => {
    const ctx = makeCtx({
      constraintZones: [
        {
          id: 'c-ground',
          name: 'Interdiction basse',
          kind: 'hauteur_limitee',
          maxHeightM: 8, // inférieur à FLOOR_M = 10
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1.2, 43.6],
                [1.3, 43.6],
                [1.3, 43.7],
                [1.2, 43.7],
                [1.2, 43.6],
              ],
            ],
          },
        },
      ],
    });

    const a = makeDroneAssignment('r1', [1.25, 43.65], 1000, 120);
    const res = deconflict([a], ctx);

    expect(res.assignments).toHaveLength(0);
    expect(res.diagnostics.some((d) => d.includes('r1') && d.includes('renoncement'))).toBe(true);
  });

  it('Topologie en chaîne (A chevauche B qui chevauche C, mais A ne chevauche pas C) : réutilisation spatiale', () => {
    const ctx = makeCtx();
    // A à x=1.22, B à x=1.23 (~800 m de A), C à x=1.245 (~1.2 km de B, ~2.0 km de A)
    // Rayon 600 m : A chevauche B (dist ~800 < 1200), B chevauche C (dist ~1200 <= 1200), A et C ne se chevauchent pas (dist ~2000 > 1200)
    const a = makeDroneAssignment('r1', [1.22, 43.65], 600, 50);
    const b = makeDroneAssignment('r2', [1.23, 43.65], 600, 50);
    const c = makeDroneAssignment('r3', [1.245, 43.65], 600, 50);

    const res = deconflict([a, b, c], ctx);
    expect(res.assignments).toHaveLength(3);
    expect(detectConflicts(res.assignments)).toHaveLength(0);

    // A et C ne se chevauchent pas horizontalement, donc ils peuvent partager la même tranche
    const placedA = res.assignments.find((x) => x.resourceId === 'r1')!;
    const placedB = res.assignments.find((x) => x.resourceId === 'r2')!;
    const placedC = res.assignments.find((x) => x.resourceId === 'r3')!;

    // B doit être séparé verticalement de A et de C
    expect(verticalOverlap(placedA.altitude, placedB.altitude)).toBe(false);
    expect(verticalOverlap(placedB.altitude, placedC.altitude)).toBe(false);
  });

  it('Séparation temporelle dynamique : aucun renoncement prématuré quand un créneau alternatif a de la place', () => {
    // 4 drones : 3 drones avec plafond 30 m, 1 drone avec plafond 50 m
    // Sous 30 m, chaque créneau peut accueillir max 2 tranches de 10 m (20 m dispo)
    // Avec 2 créneaux, les 3 drones de 30 m et le drone de 50 m doivent TOUS être placés
    const ctx = makeCtx({
      resources: [
        { id: 'r1', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
        { id: 'r2', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
        { id: 'r3', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
        { id: 'r4', pilotId: 'p1', droneModelId: 'd-tp2', available: true },
      ],
    });
    const pt: [number, number] = [1.25, 43.65];
    const inputs = [
      makeDroneAssignment('r1', pt, 1000, 30),
      makeDroneAssignment('r2', pt, 1000, 30),
      makeDroneAssignment('r3', pt, 1000, 30),
      makeDroneAssignment('r4', pt, 1000, 50),
    ];

    const res = deconflict(inputs, ctx);
    // Les 4 drones doivent être placés sans renoncement
    expect(res.assignments).toHaveLength(4);
    expect(detectConflicts(res.assignments)).toHaveLength(0);
    // Les 3 drones de 30 m doivent avoir des tranches valides
    for (const a of res.assignments) {
      expect(a.altitude.maxM).toBeLessThanOrEqual(a.resourceId === 'r4' ? 50 : 30);
      expect(a.altitude.minM).toBeGreaterThanOrEqual(FLOOR_M);
    }
  });

  it('Préservation de la doctrine de priorité lors de la saturation : les drones prioritaires sont conservés', () => {
    // 5 drones au même point sous plafond 20 m (10 m d'espace dispo : 1 seul drone par créneau)
    // r-fixed a une position imposée
    // r-tp2 a un plafond 120 m (TP2)
    // r-low1, r-low2, r-low3 sont TP1 avec plafond 20 m
    const pt: [number, number] = [1.25, 43.65];
    const ctx = makeCtx({
      resources: [
        {
          id: 'r-fixed',
          pilotId: 'p1',
          droneModelId: 'd-tp2',
          available: true,
          fixedPosition: { type: 'Point', coordinates: pt },
        },
        { id: 'r-tp2', pilotId: 'p1', droneModelId: 'd-tp2', available: true },
        { id: 'r-low1', pilotId: 'p2', droneModelId: 'd-tp1', available: true },
        { id: 'r-low2', pilotId: 'p3', droneModelId: 'd-tp1', available: true },
        { id: 'r-low3', pilotId: 'p4', droneModelId: 'd-tp1', available: true },
      ],
    });

    const inputs = [
      makeDroneAssignment('r-low1', pt, 1000, 20),
      makeDroneAssignment('r-low2', pt, 1000, 20),
      makeDroneAssignment('r-fixed', pt, 1000, 20),
      makeDroneAssignment('r-tp2', pt, 1000, 120),
      makeDroneAssignment('r-low3', pt, 1000, 20),
    ];

    const res = deconflict(inputs, ctx);
    const placedIds = res.assignments.map((a) => a.resourceId);

    // r-fixed et r-tp2 DOIVENT être placés en priorité
    expect(placedIds).toContain('r-fixed');
    expect(placedIds).toContain('r-tp2');
    expect(detectConflicts(res.assignments)).toHaveLength(0);
  });

  it('Traçabilité Niveau 1 Horizontal : les conflits résolus par secteurs dédiés sont enregistrés avec resolvedBy: horizontal', () => {
    const ctx = makeCtx();
    const pt: [number, number] = [1.25, 43.65];
    const a: Assignment = {
      ...makeDroneAssignment('r1', pt, 1000, 120),
      sector: {
        type: 'Polygon',
        coordinates: [
          [
            [1.24, 43.64],
            [1.25, 43.64],
            [1.25, 43.66],
            [1.24, 43.66],
            [1.24, 43.64],
          ],
        ],
      },
    };
    const b: Assignment = {
      ...makeDroneAssignment('r2', pt, 1000, 120),
      sector: {
        type: 'Polygon',
        coordinates: [
          [
            [1.25, 43.64],
            [1.26, 43.64],
            [1.26, 43.66],
            [1.25, 43.66],
            [1.25, 43.64],
          ],
        ],
      },
    };

    const res = deconflict([a, b], ctx);
    expect(res.assignments).toHaveLength(2);
    // Vérifier la présence du conflit résolu horizontalement
    expect(res.conflicts.some((c) => c.resolvedBy === 'horizontal')).toBe(true);
    expect(res.diagnostics.some((d) => d.includes('séparation horizontale'))).toBe(true);
  });
});
