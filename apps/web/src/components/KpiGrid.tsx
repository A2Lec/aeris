import type { Metrics, Stability } from '@aeris/shared';
import { hectares, pct } from './format';
import './components.css';

type Tone = 'info' | 'priority' | 'warn';

function Kpi({
  label,
  value,
  ratio,
  tone,
  sub,
  delta,
}: {
  label: string;
  value: string;
  ratio?: number;
  tone?: Tone;
  sub: string;
  delta?: { points: number; better: boolean };
}) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <b className="kpi-value">
        {value}
        {delta && delta.points !== 0 && (
          <small className={delta.better ? 'up' : 'down'}>
            {delta.points > 0 ? '+' : ''}
            {delta.points}
          </small>
        )}
      </b>
      {ratio !== undefined && (
        <span className={`gauge ${tone ?? ''}`} aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
        </span>
      )}
      <small>{sub}</small>
    </div>
  );
}

const points = (a: number, b: number) => Math.round((a - b) * 100);

/** Ce qui change pour les équipes : déplacements, retraits, ajouts, zone réattribuée. */
function stabilityDetail(s: Stability): string {
  const parts = [
    s.moved.length > 0 && `jusqu’à ${Math.round(s.maxShiftM)} m`,
    s.removed.length > 0 && `${s.removed.length} retiré${s.removed.length > 1 ? 's' : ''}`,
    s.added.length > 0 && `${s.added.length} ajouté${s.added.length > 1 ? 's' : ''}`,
    s.reassignedShare > 0 && `${pct(s.reassignedShare)} de zone réattribuée`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'aucun couple ne bouge';
}

/**
 * Les 4 indicateurs d'évaluation (computeMetrics) : couverture totale, prioritaire,
 * chevauchement et stabilité après changement (mesurée seulement lors d'un recalcul).
 * `compare` (dispositif en place) affiche l'écart en points.
 */
export function KpiGrid({
  metrics,
  stability,
  compare,
}: {
  metrics: Metrics;
  stability?: Stability;
  compare?: Metrics;
}) {
  const delta = (k: 'coverage' | 'priorityCoverage' | 'overlap') =>
    compare && {
      points: points(metrics[k], compare[k]),
      better: k === 'overlap' ? metrics[k] < compare[k] : metrics[k] > compare[k],
    };
  return (
    <div className="kpis">
      <Kpi
        label="Couverture totale"
        value={pct(metrics.coverage)}
        ratio={metrics.coverage}
        tone="info"
        sub={`${hectares(metrics.uncoveredAreaM2)} non couverts`}
        delta={delta('coverage')}
      />
      <Kpi
        label="Zones prioritaires"
        value={pct(metrics.priorityCoverage)}
        ratio={metrics.priorityCoverage}
        tone="priority"
        sub="couvertes par un drone capable"
        delta={delta('priorityCoverage')}
      />
      <Kpi
        label="Chevauchement"
        value={pct(metrics.overlap)}
        ratio={metrics.overlap}
        tone="warn"
        sub="de la surface couverte"
        delta={delta('overlap')}
      />
      {stability ? (
        <Kpi
          label="Stabilité"
          value={`${stability.moved.length} déplacé${stability.moved.length > 1 ? 's' : ''}`}
          sub={stabilityDetail(stability)}
        />
      ) : (
        <Kpi label="Stabilité" value="—" sub="mesurée lors d’un recalcul en conduite" />
      )}
    </div>
  );
}
