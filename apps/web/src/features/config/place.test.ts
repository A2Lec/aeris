import { describe, expect, it } from 'vitest';
import { parsePlaces } from './place';

describe('parsePlaces', () => {
  it('lit les lieux et choisit un zoom selon leur nature', () => {
    const places = parsePlaces({
      features: [
        {
          geometry: { coordinates: [6.87, 45.92] },
          properties: {
            label: 'Chamonix-Mont-Blanc',
            context: '74, Haute-Savoie',
            type: 'municipality',
          },
        },
        {
          geometry: { coordinates: [2.35, 48.85] },
          properties: { label: '1 Rue de Rivoli 75001 Paris', type: 'housenumber' },
        },
      ],
    });
    expect(places).toEqual([
      {
        label: 'Chamonix-Mont-Blanc',
        context: '74, Haute-Savoie',
        lng: 6.87,
        lat: 45.92,
        zoom: 13,
      },
      { label: '1 Rue de Rivoli 75001 Paris', context: undefined, lng: 2.35, lat: 48.85, zoom: 17 },
    ]);
  });

  it('ignore les résultats incomplets et les réponses inattendues', () => {
    expect(parsePlaces({ features: [{ properties: { label: 'Sans position' } }] })).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({ message: 'erreur' })).toEqual([]);
  });
});
