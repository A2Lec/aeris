/**
 * Recherche d'un lieu (commune, lieu-dit, adresse) pour centrer la carte avant de dessiner.
 * Service de géocodage de la Géoplateforme (IGN), successeur de la Base Adresse Nationale :
 * gratuit, sans clé, appelé directement depuis le navigateur.
 */
export const PLACE_SEARCH_URL = 'https://data.geopf.fr/geocodage/search';

export interface Place {
  label: string;
  /** Département et région, pour lever les homonymes. */
  context?: string;
  lng: number;
  lat: number;
  /** Zoom adapté : une commune se voit en entier, une adresse de près. */
  zoom: number;
}

const ZOOM_BY_TYPE: Record<string, number> = {
  municipality: 13,
  locality: 15,
  street: 16,
  housenumber: 17,
};

interface GeocodeFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; context?: string; type?: string };
}

/** Lit la réponse GeoJSON du service ; ignore les résultats incomplets. */
export function parsePlaces(json: unknown): Place[] {
  const features = (json as { features?: GeocodeFeature[] })?.features ?? [];
  return features.flatMap((f) => {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const label = f.properties?.label;
    if (!label || typeof lng !== 'number' || typeof lat !== 'number') return [];
    return [
      {
        label,
        context: f.properties?.context,
        lng,
        lat,
        zoom: ZOOM_BY_TYPE[f.properties?.type ?? ''] ?? 14,
      },
    ];
  });
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${PLACE_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Recherche de lieu indisponible');
  return parsePlaces(await res.json());
}
