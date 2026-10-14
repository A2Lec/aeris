import { create } from 'zustand';

const ign = (layer: string, format: string) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${format}` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

export type BasemapId = 'plan' | 'osm' | 'ortho';

/** Fonds de carte proposés dans le bandeau. */
export const BASEMAPS: { id: BasemapId; label: string; url: string; attribution: string }[] = [
  {
    id: 'plan',
    label: 'Plan IGN',
    url: ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    attribution: '© IGN-F/Géoplateforme',
  },
  {
    id: 'osm',
    label: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© contributeurs OpenStreetMap',
  },
  {
    id: 'ortho',
    label: 'Ortho',
    url: ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    attribution: '© IGN-F/Géoplateforme',
  },
];

export const useBasemapStore = create<{ basemap: BasemapId; setBasemap: (b: BasemapId) => void }>(
  (set) => ({ basemap: 'plan', setBasemap: (basemap) => set({ basemap }) }),
);
