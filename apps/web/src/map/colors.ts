import type { ConstraintKind, PilotLevel } from '@aeris/shared';
import { SEMANTIC } from '../theme';

/** Palette des couches, tirée des jetons du thème (une couleur = un sens). */

/** Zones prioritaires : violet, plus soutenu quand la priorité monte. */
export const PRIORITY_COLORS: Record<number, string> = {
  1: '#A78BFA',
  2: '#8B5CF6',
  3: SEMANTIC.priority,
};

export const CONSTRAINT_COLORS: Record<ConstraintKind, string> = {
  interdite: SEMANTIC.danger,
  hauteur_limitee: SEMANTIC.limited,
  urbaine: SEMANTIC.neutral,
};

/** Contour en tirets des zones à hauteur limitée (terrain militaire). */
export const CONSTRAINT_DASH: Partial<Record<ConstraintKind, string>> = {
  hauteur_limitee: '4 4',
};

/** Zone de travail / périmètre de l'arrêté. */
export const WORK_AREA_STYLE = {
  color: SEMANTIC.perimeter,
  weight: 2.5,
  dashArray: '8 4',
  fillOpacity: 0.03,
} as const;

/** Couverture par niveau de télépilote : TP1 (1 km) en vert, TP2 (2 km) en bleu. */
export const LEVEL_COLORS: Record<PilotLevel, string> = {
  TP1: SEMANTIC.ok,
  TP2: SEMANTIC.info,
};

export const COVERAGE_COLORS = {
  covered: SEMANTIC.info,
  overlap: SEMANTIC.warn,
  gaps: SEMANTIC.danger,
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

/** Couleur stable par couple (zones limites). */
export function resourceColor(resourceId: string, allIds: string[]): string {
  const i = Math.max(0, allIds.indexOf(resourceId));
  return RESOURCE_PALETTE[i % RESOURCE_PALETTE.length];
}
