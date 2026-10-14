import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { create } from 'zustand';

/** Couple mis en évidence par le bouton « Déplacer » : la carte se centre dessus. */
export const useFocusStore = create<{ focusId?: string; focus: (id?: string) => void }>((set) => ({
  focus: (focusId) => set({ focusId }),
}));

/** À placer dans la carte : centre la vue sur la position donnée quand le focus change. */
export function FlyToFocus({ position }: { position?: [number, number] }) {
  const map = useMap();
  const [lng, lat] = position ?? [];
  useEffect(() => {
    if (lng !== undefined && lat !== undefined)
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, lng, lat]);
  return null;
}
