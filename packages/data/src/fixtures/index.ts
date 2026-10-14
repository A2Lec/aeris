import { Mission, type MissionInput, type PolygonGeom } from '@aeris/shared';

/**
 * Missions de test : la démo + des cas limites. Utilisées par les suites de contrat
 * (@aeris/contracts) : tout moteur doit tenir ses invariants sur CHACUNE d'elles.
 * Ajouter un cas = ajouter une entrée ici (et le dire à l'équipe).
 */
export interface TestMission {
  name: string;
  description: string;
  mission: Mission;
}

function rect(minLng: number, minLat: number, maxLng: number, maxLat: number): PolygonGeom {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

export function buildTestMissions(demo: MissionInput): TestMission[] {
  const make = (name: string, description: string, patch: Partial<MissionInput>): TestMission => ({
    name,
    description,
    mission: Mission.parse({ ...JSON.parse(JSON.stringify(demo)), ...patch, id: `test-${name}` }),
  });
  const res = demo.resources;

  return [
    make('demo', 'Mission de démo telle quelle (Bouconne, 2 phases)', {}),
    make('sans-moyen', 'Tous les couples indisponibles', {
      resources: res.map((r) => ({ ...r, available: false })),
    }),
    make('arrete-zero', "L'arrêté interdit tout drone (maxDrones = 0)", { maxDrones: 0 }),
    make('arrete-serre', 'Arrêté plus restrictif que les moyens (maxDrones = 2)', {
      maxDrones: 2,
    }),
    make('position-imposee', 'r1 a une position imposée, r2 une zone limite étroite', {
      resources: res.map((r) =>
        r.id === 'r1'
          ? { ...r, fixedPosition: { type: 'Point', coordinates: [1.24, 43.665] } }
          : r.id === 'r2'
            ? { ...r, allowedArea: rect(1.255, 43.64, 1.265, 43.648) }
            : r,
      ),
    }),
    make('nuit-thermique', 'Zone prioritaire exigeant thermique + nuit, aucun drone capable', {
      resources: res.filter((r) => r.droneModelId !== 'matrice-4t'),
      priorityZones: [
        {
          id: 'zn',
          name: 'Recherche de nuit',
          level: 3,
          requires: { thermal: true, night: true },
          geometry: rect(1.21, 43.64, 1.24, 43.66),
        },
      ],
    }),
    make('plafond-militaire', 'Toute la zone sous plafond militaire de 50 m', {
      constraintZones: [
        {
          id: 'cm',
          name: 'Terrain militaire',
          kind: 'hauteur_limitee',
          maxHeightM: 50,
          geometry: rect(1.18, 43.62, 1.28, 43.68),
        },
      ],
    }),
    make('urbain', 'Environnement urbain (plafonds TP1 différents)', { environment: 'urbain' }),
    make('trois-phases', '3 phases, une zone prioritaire différente par phase', {
      phaseCount: 3,
      priorityZones: [
        {
          id: 'p0',
          name: 'Phase 1',
          level: 3,
          requires: {},
          phases: [0],
          geometry: rect(1.2, 43.63, 1.22, 43.645),
        },
        {
          id: 'p1',
          name: 'Phase 2',
          level: 2,
          requires: {},
          phases: [1],
          geometry: rect(1.24, 43.64, 1.26, 43.655),
        },
        {
          id: 'p2',
          name: 'Phase 3',
          level: 1,
          requires: {},
          phases: [2],
          geometry: rect(1.21, 43.66, 1.23, 43.67),
        },
      ],
    }),
    make('petite-zone', 'Zone minuscule, un seul couple TP1', {
      workArea: rect(1.22, 43.645, 1.226, 43.649),
      maxDrones: 1,
      pilots: demo.pilots.filter((p) => p.id === 'p3'),
      resources: res.filter((r) => r.id === 'r3'),
      priorityZones: [],
      constraintZones: [],
    }),
    make('zone-interdite-large', 'Moitié ouest interdite', {
      constraintZones: [
        {
          id: 'ci',
          name: 'Zone interdite',
          kind: 'interdite',
          geometry: rect(1.18, 43.62, 1.23, 43.68),
        },
      ],
    }),
  ];
}
