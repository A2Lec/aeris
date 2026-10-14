import { describe, expect, it } from 'vitest';
import type { Mission } from '@aeris/shared';
import { describeEvent } from './events';

const mission = {
  priorityZones: [{ id: 'z1', name: 'Lisière nord' }],
} as unknown as Mission;

describe('describeEvent', () => {
  it('décrit chaque événement en français lisible', () => {
    expect(describeEvent({ type: 'resource_unavailable', resourceId: 'r2' }, mission)).toBe(
      'r2 déclaré indisponible',
    );
    expect(describeEvent({ type: 'phase_changed', phase: 1 }, mission)).toBe('Passage en phase 2');
    expect(describeEvent({ type: 'priority_zone_removed', zoneId: 'z1' }, mission)).toBe(
      'Zone prioritaire retirée : Lisière nord',
    );
  });

  it('donne le vent en km/h et signale la pluie', () => {
    const text = describeEvent(
      {
        type: 'weather_update',
        weather: {
          windMs: 11,
          gustMs: 14,
          precipitationMm: 0.4,
          temperatureC: 12,
          isDay: true,
          fetchedAt: '2026-10-14T10:00:00Z',
          source: 'manuel',
        },
      },
      mission,
    );
    expect(text).toBe('Météo : vent 40 km/h, rafales 50, pluie');
  });
});
