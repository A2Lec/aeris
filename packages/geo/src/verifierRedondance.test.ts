import { describe, expect, it } from 'vitest';
import { Mission, type DroneModel, type PolygonGeom } from '@aeris/shared';
import { verifierRedondance } from './redondance';

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

const modele = (id: string, thermal: boolean, zoomX: number): DroneModel => ({
  id,
  name: id,
  enduranceMin: 40,
  maxWindMs: 12,
  rainOk: true,
  minTempC: -10,
  maxTempC: 40,
  zoomX,
  thermal,
  night: thermal,
});
const catalogue = [modele('thermique', true, 100), modele('simple', false, 4)];

const mission = (maxDrones = 3, dispo = true) =>
  Mission.parse({
    id: 'v',
    name: 'v',
    maxDrones,
    workArea: rect(1.18, 43.62, 1.28, 43.665),
    pilots: [
      { id: 'p1', name: 'Faucon 1', level: 'TP2' },
      { id: 'p2', name: 'Milan 1', level: 'TP1' },
      { id: 'p3', name: 'Milan 2', level: 'TP1' },
    ],
    resources: [
      { id: 'r1', pilotId: 'p1', droneModelId: 'thermique', available: dispo },
      { id: 'r2', pilotId: 'p2', droneModelId: 'simple' },
      { id: 'r3', pilotId: 'p3', droneModelId: 'simple' },
    ],
    priorityZones: [
      { id: 'etang', name: 'Étang', level: 2, geometry: rect(1.225, 43.638, 1.235, 43.643) },
      {
        id: 'lisiere',
        name: 'Lisière nord',
        level: 3,
        requires: { thermal: true, minZoomX: 50 },
        geometry: rect(1.19, 43.65, 1.22, 43.66),
      },
    ],
  });

describe('verifierRedondance', () => {
  it('rien de demandé : aucun message', () => {
    expect(verifierRedondance(mission(), catalogue, {})).toEqual([]);
  });

  it('demande possible : aucun message', () => {
    expect(verifierRedondance(mission(), catalogue, { etang: 3 })).toEqual([]);
  });

  it("plus de drones que l'arrêté n'en autorise", () => {
    const [m] = verifierRedondance(mission(2), catalogue, { etang: 3 });
    expect(m).toBe("Étang : 3 drones voulus, l'arrêté en autorise 2 au total.");
  });

  it('pas assez de drones avec les capacités exigées : le message les nomme', () => {
    const [m] = verifierRedondance(mission(), catalogue, { lisiere: 2 });
    expect(m).toBe(
      'Lisière nord : 2 drones voulus avec caméra thermique, zoom ×50, la mission en a 1 disponible(s) (r1).',
    );
  });

  it('un couple indisponible ne compte pas', () => {
    const [m] = verifierRedondance(mission(3, false), catalogue, { lisiere: 2 });
    expect(m).toContain('la mission en a 0 disponible(s).');
  });

  it('saisie invalide', () => {
    expect(verifierRedondance(mission(), catalogue, { etang: 1.5 })[0]).toContain('invalide');
    expect(verifierRedondance(mission(), catalogue, { etang: 0 })[0]).toContain('invalide');
  });
});
