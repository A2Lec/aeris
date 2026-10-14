import { useEffect } from 'react';
import { CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useConfigEditorStore } from './store';

/** Centre la carte sur le lieu choisi à la première fenêtre, et le repère d'un point. */
export function PlaceLayer() {
  const map = useMap();
  const place = useConfigEditorStore((s) => s.setupPlace);

  useEffect(() => {
    if (place) map.flyTo([place.lat, place.lng], place.zoom, { duration: 0.8 });
  }, [map, place]);

  return place ? (
    <CircleMarker
      center={[place.lat, place.lng]}
      radius={6}
      pathOptions={{ color: '#003189', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
    >
      <Tooltip direction="top" offset={[0, -6]}>
        {place.label}
      </Tooltip>
    </CircleMarker>
  ) : null;
}
