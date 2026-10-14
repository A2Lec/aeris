import type { Metrics } from '@aeris/shared';

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Indicateurs du brief : couverture totale, prioritaire, chevauchement. */
export function MetricsCard({ metrics, compare }: { metrics: Metrics; compare?: Metrics }) {
  const delta = (k: 'coverage' | 'priorityCoverage' | 'overlap') => {
    if (!compare) return null;
    const d = Math.round((metrics[k] - compare[k]) * 100);
    // Plus de chevauchement = moins bien : la couleur s'inverse.
    const better = k === 'overlap' ? d < 0 : d > 0;
    return d === 0 ? null : (
      <small className={better ? 'up' : 'down'}>
        {' '}
        {d > 0 ? '+' : ''}
        {d}
      </small>
    );
  };
  return (
    <div className="metrics">
      <div>
        <b>{pct(metrics.coverage)}</b>
        {delta('coverage')}
        <span>couverte</span>
      </div>
      <div>
        <b>{pct(metrics.priorityCoverage)}</b>
        {delta('priorityCoverage')}
        <span>prioritaire</span>
      </div>
      <div>
        <b>{pct(metrics.overlap)}</b>
        {delta('overlap')}
        <span>chevauchement</span>
      </div>
      <div>
        <b>{Math.round(metrics.uncoveredAreaM2 / 1e4)} ha</b>
        <span>non couverts</span>
      </div>
    </div>
  );
}
