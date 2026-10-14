import type { Metrics, Proposal, SolveStatus, Strategy } from '@aeris/shared';

/**
 * Logique de la comparaison des propositions (fonctions pures, testées dans compare.test.ts).
 * Les valeurs sont exprimées dans l'unité affichée et arrondies : deux propositions qui
 * s'affichent pareil sont ex aequo, on ne désigne pas de « meilleure » sur un écart invisible.
 */

export type CriterionId =
  'coverage' | 'priorityCoverage' | 'weightedCoverage' | 'overlap' | 'uncoveredHa' | 'drones';

export interface Criterion {
  id: CriterionId;
  label: string;
  /** Sens du « mieux » : plus de couverture, mais moins de chevauchement ou de drones. */
  better: 'max' | 'min';
  unit: string;
  /** Valeur de la proposition pour une phase ; undefined si la phase n'a pas été calculée. */
  value: (p: Proposal, phase: number) => number | undefined;
}

const pct = (x: number) => Math.round(x * 100);

const fromMetrics =
  (read: (m: Metrics) => number) =>
  (p: Proposal, phase: number): number | undefined => {
    const m = p.metricsByPhase[phase] as Metrics | undefined;
    return m ? read(m) : undefined;
  };

/** Nombre de couples engagés sur une phase. */
export function engagedCount(p: Proposal, phase: number): number {
  return new Set(p.assignments.filter((a) => a.phase === phase).map((a) => a.resourceId)).size;
}

export const CRITERIA: Criterion[] = [
  {
    id: 'coverage',
    label: 'Zone couverte',
    better: 'max',
    unit: ' %',
    value: fromMetrics((m) => pct(m.coverage)),
  },
  {
    id: 'priorityCoverage',
    label: 'Zones prioritaires',
    better: 'max',
    unit: ' %',
    value: fromMetrics((m) => pct(m.priorityCoverage)),
  },
  {
    id: 'weightedCoverage',
    label: 'Couverture pondérée',
    better: 'max',
    unit: ' %',
    value: fromMetrics((m) => pct(m.weightedCoverage)),
  },
  {
    id: 'overlap',
    label: 'Chevauchement',
    better: 'min',
    unit: ' %',
    value: fromMetrics((m) => pct(m.overlap)),
  },
  {
    id: 'uncoveredHa',
    label: 'Non couvert',
    better: 'min',
    unit: ' ha',
    value: fromMetrics((m) => Math.round(m.uncoveredAreaM2 / 1e4)),
  },
  {
    id: 'drones',
    label: 'Drones engagés',
    better: 'min',
    unit: '',
    value: (p, phase) => (p.metricsByPhase[phase] ? engagedCount(p, phase) : undefined),
  },
];

export const criterion = (id: CriterionId): Criterion =>
  CRITERIA.find((c) => c.id === id) ?? CRITERIA[0];

export function formatValue(c: Criterion, v: number | undefined): string {
  return v === undefined ? '—' : `${v}${c.unit}`;
}

export const STATUS_LABELS: Record<SolveStatus, string> = {
  optimal: 'Optimale',
  faisable: 'Faisable',
  infaisable: 'Infaisable',
};

/**
 * Identifiants des propositions qui ont la meilleure valeur sur ce critère.
 * Vide s'il y a moins de deux propositions comparables ou si elles sont toutes ex aequo.
 * Une proposition infaisable n'est jamais « la meilleure ».
 */
export function bestIds(proposals: Proposal[], phase: number, c: Criterion): Set<string> {
  const valued = proposals
    .filter((p) => p.status !== 'infaisable')
    .map((p) => ({ id: p.id, v: c.value(p, phase) }))
    .filter((x): x is { id: string; v: number } => x.v !== undefined);
  if (valued.length < 2) return new Set();
  const values = valued.map((x) => x.v);
  const best = c.better === 'max' ? Math.max(...values) : Math.min(...values);
  if (values.every((v) => v === best)) return new Set();
  return new Set(valued.filter((x) => x.v === best).map((x) => x.id));
}

const SHORT_LABELS: Record<Strategy, string> = {
  couverture_globale: 'Couverture',
  priorite: 'Priorité',
  economie_moyens: 'Économie',
};

/**
 * En-têtes de colonnes courts (le panneau est étroit). Une stratégie relancée
 * plusieurs fois est numérotée dans l'ordre de création ; ✎ signale une proposition retouchée.
 */
export function columnLabels(proposals: Proposal[]): Map<string, string> {
  const total = new Map<Strategy, number>();
  for (const p of proposals) total.set(p.strategy, (total.get(p.strategy) ?? 0) + 1);
  const seen = new Map<Strategy, number>();
  const labels = new Map<string, string>();
  for (const p of proposals) {
    const n = (seen.get(p.strategy) ?? 0) + 1;
    seen.set(p.strategy, n);
    const num = (total.get(p.strategy) ?? 0) > 1 ? ` ${n}` : '';
    const edited = p.label.endsWith('(modifiée)') ? ' ✎' : '';
    labels.set(p.id, `${SHORT_LABELS[p.strategy]}${num}${edited}`);
  }
  return labels;
}
