import type { PolygonGeom, PriorityZone } from '@aeris/shared';

const EARTH_M = 6_371_000;

/** Polygone approchant un cercle (24 sommets) autour d'un point [lng, lat]. */
export function circlePolygon(
  [lng, lat]: [number, number],
  radiusM: number,
  sides = 24,
): PolygonGeom {
  const dLat = (radiusM / EARTH_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [...Array(sides).keys()].map((i) => {
    const t = (2 * Math.PI * i) / sides;
    return [lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)];
  });
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

/** Zone prioritaire posée en direct pendant la conduite (événement priority_zone_added). */
export function liveZone(
  center: [number, number],
  level: 1 | 2 | 3,
  index: number,
  radiusM = 400,
): PriorityZone {
  return {
    id: crypto.randomUUID(),
    name: `Zone ajoutée en conduite ${index}`,
    geometry: circlePolygon(center, radiusM),
    level,
    requires: {},
    redundancy: 1,
  };
}
