import { GeoJSON } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import type { CoverageLayers } from '@aeris/shared';
import { COVERAGE_COLORS } from '../colors';

const geo = (g: unknown) => g as GeoJsonObject;

/**
 * Couverture d'une phase calculée par @aeris/geo : surface couverte, chevauchements (ambre)
 * et trous de couverture (rouge, pointillés). Les données viennent des routes `coverage`.
 */
export function CoverageLayer({ layers }: { layers: CoverageLayers }) {
  // La clé change avec les géométries : react-leaflet ne met pas à jour `data` en place.
  const key = (name: string, g: unknown) => `${name}-${layers.phase}-${JSON.stringify(g).length}`;
  return (
    <>
      <GeoJSON
        key={key('cov', layers.covered)}
        data={geo(layers.covered)}
        interactive={false}
        style={{ stroke: false, fillColor: COVERAGE_COLORS.covered, fillOpacity: 0.08 }}
      />
      <GeoJSON
        key={key('ovl', layers.overlap)}
        data={geo(layers.overlap)}
        interactive={false}
        style={{ stroke: false, fillColor: COVERAGE_COLORS.overlap, fillOpacity: 0.28 }}
      />
      <GeoJSON
        key={key('gap', layers.gaps)}
        data={geo(layers.gaps)}
        interactive={false}
        style={{
          color: COVERAGE_COLORS.gaps,
          weight: 1.5,
          dashArray: '3 4',
          fillColor: COVERAGE_COLORS.gaps,
          fillOpacity: 0.1,
        }}
      />
    </>
  );
}
