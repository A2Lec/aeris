import { describe, expect, it } from 'vitest';
import { PriorityZone } from '@aeris/shared';
import { circlePolygon, liveZone } from './zone';

describe('zone posée en conduite', () => {
  it('forme un anneau fermé autour du point, au bon rayon', () => {
    const poly = circlePolygon([1.3, 43.6], 400);
    const ring = poly.coordinates[0];
    expect(ring).toHaveLength(25);
    expect(ring[0]).toEqual(ring[24]);
    // Premier sommet plein est : 400 m ≈ 0,00497° de longitude à 43,6° N.
    expect(ring[0][0] - 1.3).toBeCloseTo(0.00497, 4);
    expect(ring[6][1] - 43.6).toBeCloseTo(0.0036, 4);
  });

  it('respecte le contrat des zones prioritaires', () => {
    const zone = liveZone([1.3, 43.6], 3, 2);
    expect(PriorityZone.safeParse(zone).success).toBe(true);
    expect(zone.name).toBe('Zone ajoutée en conduite 2');
  });
});
