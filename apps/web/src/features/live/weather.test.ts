import { describe, expect, it } from 'vitest';
import type { DroneModel, Weather } from '@aeris/shared';
import { editWeather, weatherLimits } from './weather';

const calm: Weather = {
  windMs: 3,
  gustMs: 5,
  precipitationMm: 0,
  temperatureC: 15,
  isDay: true,
  fetchedAt: '2026-10-14T08:00:00.000Z',
  source: 'api',
};
const drone = {
  id: 'd',
  name: 'Drone',
  enduranceMin: 30,
  maxWindMs: 10,
  rainOk: false,
  minTempC: -10,
  maxTempC: 40,
  zoomX: 2,
  thermal: false,
  night: false,
} as DroneModel;

describe('météo de reprise', () => {
  it('une correction devient une saisie manuelle datée', () => {
    const now = new Date('2026-10-14T10:00:00.000Z');
    expect(editWeather(calm, { windMs: 8 }, now)).toEqual({
      ...calm,
      windMs: 8,
      source: 'manuel',
      fetchedAt: now.toISOString(),
    });
  });

  it('liste les limites du drone dépassées, comme le serveur', () => {
    expect(weatherLimits(drone, calm)).toEqual([]);
    expect(
      weatherLimits(drone, {
        ...calm,
        gustMs: 12,
        precipitationMm: 1,
        temperatureC: 45,
        isDay: false,
      }),
    ).toEqual(['vent trop fort', 'pluie', 'température', 'vol de nuit']);
  });
});
