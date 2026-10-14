import { describe, expect, it } from 'vitest';
import type { DroneModel, Mission, Weather } from '@aeris/shared';
import { METEO_PRESETS, centreZone, meteoDuPreset, modelesAuSol, seuilModele } from './meteo';

const modele = (id: string, name: string, rainOk: boolean): DroneModel => ({
  id,
  name,
  enduranceMin: 40,
  maxWindMs: 12,
  rainOk,
  minTempC: -10,
  maxTempC: 40,
  zoomX: 10,
  thermal: false,
  night: false,
});
const catalogue = [
  modele('m4t', 'DJI Matrice 4T', true),
  modele('m3e', 'DJI Mavic 3 Enterprise', false),
  modele('mini', 'DJI Mini 5 Pro', false),
];
const preset = (id: string) => METEO_PRESETS.find((p) => p.id === id)!;

describe('météos préréglées', () => {
  it('pluie : seul le drone étanche reste en l’air', () => {
    expect(modelesAuSol(catalogue, preset('pluie')).map((m) => m.id)).toEqual(['m3e', 'mini']);
  });

  it('rafales fortes : tous au sol ; retour au calme : aucun', () => {
    expect(modelesAuSol(catalogue, preset('rafales'))).toHaveLength(3);
    expect(modelesAuSol(catalogue, preset('calme'))).toHaveLength(0);
  });

  it('garde jour / nuit et température de la météo en cours, source manuelle', () => {
    const nuit = { isDay: false, temperatureC: 4 } as Weather;
    const w = meteoDuPreset(preset('calme'), nuit, new Date('2026-10-14T15:00:00Z'));
    expect(w).toMatchObject({ isDay: false, temperatureC: 4, gustMs: 6, source: 'manuel' });
    expect(w.fetchedAt).toBe('2026-10-14T15:00:00.000Z');
    expect(meteoDuPreset(preset('calme')).isDay).toBe(true);
  });

  it('centre de la zone et seuils lisibles', () => {
    const mission = {
      workArea: {
        type: 'Polygon',
        coordinates: [
          [
            [1, 43],
            [2, 43],
            [2, 44],
            [1, 44],
          ],
        ],
      },
    } as unknown as Mission;
    expect(centreZone(mission)).toEqual([1.5, 43.5]);
    expect(seuilModele(catalogue[0])).toBe('Matrice 4T : 43 km/h, étanche');
  });
});
