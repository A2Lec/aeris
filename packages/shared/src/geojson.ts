import { z } from 'zod';

/** Coordonnées GeoJSON : [longitude, latitude] (attention, Leaflet attend [lat, lng]). */
export const LngLat = z.tuple([z.number(), z.number()]);
export type LngLat = z.infer<typeof LngLat>;

export const PointGeom = z.object({ type: z.literal('Point'), coordinates: LngLat });
export type PointGeom = z.infer<typeof PointGeom>;

export const PolygonGeom = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(LngLat)),
});
export type PolygonGeom = z.infer<typeof PolygonGeom>;

export const MultiPolygonGeom = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(LngLat))),
});
export type MultiPolygonGeom = z.infer<typeof MultiPolygonGeom>;

/** Toute surface : zone prioritaire, contrainte, zone limite d'un drone, secteur. */
export const AreaGeom = z.discriminatedUnion('type', [PolygonGeom, MultiPolygonGeom]);
export type AreaGeom = z.infer<typeof AreaGeom>;
