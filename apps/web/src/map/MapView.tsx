import type { ReactNode } from 'react';
import { LayersControl, MapContainer, TileLayer } from 'react-leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

const ign = (layer: string, format: string) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${format}` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

/** Carte de base + sélecteur de fonds. Les couches métier sont passées en enfants. */
export function MapView({ children }: { children?: ReactNode }) {
  return (
    <MapContainer center={[43.6047, 1.4442]} zoom={11} className="map">
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Plan IGN">
          <TileLayer
            url={ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')}
            attribution="© IGN-F/Géoplateforme"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© contributeurs OpenStreetMap"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite (ortho IGN)">
          <TileLayer
            url={ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')}
            attribution="© IGN-F/Géoplateforme"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      {children}
    </MapContainer>
  );
}
