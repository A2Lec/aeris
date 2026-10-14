/** Palette partagée par toutes les couches (une couleur stable par couple). */
export const PRIORITY_COLORS: Record<number, string> = {
  1: '#e9c46a',
  2: '#f4a261',
  3: '#e63946',
};

export const CONSTRAINT_COLORS = {
  interdite: '#9d0208',
  hauteur_limitee: '#6a4c93',
  urbaine: '#6c757d',
} as const;

const RESOURCE_PALETTE = [
  '#1d4ed8',
  '#0f766e',
  '#7c3aed',
  '#c2410c',
  '#be185d',
  '#4d7c0f',
  '#0369a1',
  '#a16207',
];

export function resourceColor(resourceId: string, allIds: string[]): string {
  const i = Math.max(0, allIds.indexOf(resourceId));
  return RESOURCE_PALETTE[i % RESOURCE_PALETTE.length];
}
