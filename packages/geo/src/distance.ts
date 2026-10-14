/**
 * Projection équirectangulaire locale : précise à < 0,5 % à l'échelle d'une
 * mission (quelques dizaines de km), et beaucoup plus rapide que haversine.
 */
export const M_PER_DEG_LAT = 110_574;

export function metersPerDegLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export function distanceM(a: [number, number], b: [number, number]): number {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * metersPerDegLng(lat);
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}
