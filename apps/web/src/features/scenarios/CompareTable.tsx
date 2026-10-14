import type { Proposal } from '@aeris/shared';
import { CRITERIA, bestIds, columnLabels, formatValue } from './compare';

/**
 * Comparaison en lecture seule : propositions en colonnes, critères en lignes.
 * La proposition retenue est soulignée ; la meilleure valeur de chaque ligne ressort en vert.
 */
export function CompareTable({
  proposals,
  selectedId,
  phase,
}: {
  proposals: Proposal[];
  selectedId?: string;
  phase: number;
}) {
  const labels = columnLabels(proposals);
  const cell = (p: Proposal, best = false) =>
    [p.id === selectedId && 'selected', best && 'best'].filter(Boolean).join(' ') || undefined;

  return (
    <table className="compare">
      <caption className="sr-only">Comparaison des propositions, phase {phase + 1}</caption>
      <thead>
        <tr>
          <td />
          {proposals.map((p) => (
            <th key={p.id} scope="col" className={cell(p)} title={p.label}>
              {labels.get(p.id)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map((c) => {
          const best = bestIds(proposals, phase, c);
          return (
            <tr key={c.id}>
              <th scope="row">
                {c.label}
                <span
                  className="sense"
                  title={c.better === 'max' ? 'Plus haut = mieux' : 'Plus bas = mieux'}
                >
                  {c.better === 'max' ? '↑' : '↓'}
                </span>
              </th>
              {proposals.map((p) => (
                <td key={p.id} className={cell(p, best.has(p.id))}>
                  {formatValue(c, c.value(p, phase))}
                </td>
              ))}
            </tr>
          );
        })}
        <tr>
          <th scope="row">Alertes</th>
          {proposals.map((p) => (
            <td
              key={p.id}
              className={[cell(p), p.diagnostics.length > 0 && 'warn'].filter(Boolean).join(' ')}
              title={p.diagnostics.join('\n') || undefined}
            >
              {p.diagnostics.length || '—'}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
