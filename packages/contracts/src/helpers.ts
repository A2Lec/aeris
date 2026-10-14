/**
 * Outils de vérification indépendants des moteurs testés (pas de turf, pas de @aeris/geo) :
 * un moteur ne doit pas pouvoir « passer » son contrat grâce à son propre bug.
 */
import type { AreaGeom, Assignment, LngLat, MultiPolygonGeom, PolygonGeom } from '@aeris/shared';

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function distM(a: LngLat, b: LngLat): number {
  const lat = (a[1] + b[1]) / 2;
  return Math.hypot((b[0] - a[0]) * mPerDegLng(lat), (b[1] - a[1]) * M_PER_DEG_LAT);
}

function inRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygonRings(p: LngLat, rings: LngLat[][]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && inRing(p, outer) && !holes.some((h) => inRing(p, h));
}

export function inArea(p: LngLat, area: AreaGeom | PolygonGeom): boolean {
  return area.type === 'Polygon'
    ? inPolygonRings(p, area.coordinates)
    : area.coordinates.some((poly) => inPolygonRings(p, poly));
}

function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = mPerDegLng(lat0);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a +=
      ring[j][0] * kx * ring[i][1] * M_PER_DEG_LAT - ring[i][0] * kx * ring[j][1] * M_PER_DEG_LAT;
  }
  return Math.abs(a / 2);
}

/** Surface d'un MultiPolygon dont les polygones ne se recouvrent pas. */
export function areaM2(geom: MultiPolygonGeom | PolygonGeom): number {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let total = 0;
  for (const [outer, ...holes] of polys) {
    if (!outer) continue;
    total += ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
  }
  return total;
}

function slotsOverlap(a: Assignment, b: Assignment): boolean {
  if (!a.slot || !b.slot) return true;
  return a.slot.start < b.slot.end && b.slot.start < a.slot.end;
}

/**
 * Deux couples d'une même phase sont en conflit s'ils partagent un volume au même moment.
 * Deux couples ayant chacun un `sector` sont réputés séparés horizontalement.
 */
export function inConflict(a: Assignment, b: Assignment): boolean {
  if (a.phase !== b.phase) return false;
  if (a.sector && b.sector) return false;
  const horizontal = distM(a.position.coordinates, b.position.coordinates) < a.radiusM + b.radiusM;
  const vertical = a.altitude.minM < b.altitude.maxM && b.altitude.minM < a.altitude.maxM;
  return horizontal && vertical && slotsOverlap(a, b);
}

export function makeAssignment(
  resourceId: string,
  coordinates: LngLat,
  radiusM: number,
  phase = 0,
  altitude = { minM: 0, maxM: 120 },
): Assignment {
  return { resourceId, phase, position: { type: 'Point', coordinates }, radiusM, altitude };
}

/** La raison d'un abandon ou d'une exclusion doit nommer le couple. */
export const mentions = (diagnostics: string[], id: string) =>
  diagnostics.some((d) => new RegExp(`\\b${id}\\b`).test(d));
