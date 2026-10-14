import { describe, expect, it } from 'vitest';
import { demoMission } from '@aeris/data';
import type { Mission, Weather } from '@aeris/shared';
import { excludedForPhase } from './pipeline';

const mission = { ...demoMission, id: 'm-test' } as Mission;

/** Mesure prise un soir calme : seul `isDay` peut écarter un drone. */
const soir: Weather = {
  windMs: 2,
  gustMs: 4,
  precipitationMm: 0,
  temperatureC: 15,
  isDay: false,
  fetchedAt: '2026-10-14T20:00:00+02:00',
  source: 'api',
};

describe('excludedForPhase', () => {
  it('une mission planifiée de jour reste de jour, même calculée le soir', () => {
    expect(excludedForPhase(mission, 0, soir)).toEqual({});
  });

  it('une phase de nuit écarte les drones sans équipement nuit', () => {
    const nuit = {
      ...mission,
      period: { start: '2026-10-14T22:00:00+02:00', end: '2026-10-15T02:00:00+02:00' },
    };
    const exclus = excludedForPhase(nuit, 0, { ...soir, isDay: true });
    expect(Object.keys(exclus).sort()).toEqual(['r2', 'r3', 'r4', 'r5']);
  });

  it('sans période déclarée, on garde le jour ou la nuit mesurés', () => {
    const { period: _, ...sansPeriode } = mission;
    expect(Object.keys(excludedForPhase(sansPeriode as Mission, 0, soir))).toHaveLength(4);
  });

  it("une météo de repli n'écarte aucun drone", () => {
    expect(excludedForPhase(mission, 0, { ...soir, source: 'repli' })).toEqual({});
  });
});
