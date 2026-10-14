import type { ReactNode } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { BASEMAPS, useBasemapStore } from './basemap';

/** Carte de base ; le fond se choisit dans le bandeau. Les couches métier sont passées en enfants. */
export function MapView({ children }: { children?: ReactNode }) {
  const basemapId = useBasemapStore((s) => s.basemap);
  const basemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0];
  return (
    <MapContainer center={[43.6047, 1.4442]} zoom={11} className="map">
      <TileLayer
        key={basemap.id}
        url={basemap.url}
        attribution={basemap.attribution}
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}
