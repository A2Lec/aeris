import { describe, expect, it } from 'vitest';
import type { Weather } from '@aeris/shared';
import { formatSlot, hectares, pct, summarizeWeather } from './format';

const weather = (w: Partial<Weather> = {}): Weather => ({
  windMs: 5,
  gustMs: 8,
  precipitationMm: 0,
  temperatureC: 14.4,
  isDay: true,
  fetchedAt: '2026-10-14T10:00:00Z',
  source: 'api',
  ...w,
});

describe('formats', () => {
  it('arrondit pourcentages et hectares', () => {
    expect(pct(0.456)).toBe('46 %');
    expect(hectares(123_456)).toBe('12 ha');
  });

  it('affiche « Permanent » sans créneau', () => {
    expect(formatSlot(undefined)).toBe('Permanent');
    expect(formatSlot({ start: '2026-10-14T10:00:00Z', end: '2026-10-14T12:30:00Z' })).toMatch(
      /^\d{2}:\d{2} – \d{2}:30$/,
    );
  });

  it('convertit le vent en km/h et décrit les conditions', () => {
    const s = summarizeWeather(weather({ precipitationMm: 0.4, isDay: false }));
    expect(s.wind).toBe('18 km/h, rafales 29');
    expect(s.conditions).toBe('pluie 0.4 mm, nuit, 14 °C');
    expect(s.caveat).toBeUndefined();
  });

  it('prévient quand la météo n’est pas une mesure réelle', () => {
    expect(summarizeWeather(weather({ source: 'repli' })).caveat).toMatch(/aucune donnée réelle/);
    expect(summarizeWeather(weather({ source: 'cache' })).caveat).toMatch(/Dernière/);
  });
});
