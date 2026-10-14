import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { KpiGrid } from '../../components/KpiGrid';
import { SeparationCard } from '../../components/SeparationCard';
import { phaseDiagnostics } from '../../components/separation';
import { useLiveStore } from './store';

/**
 * Panneau droit de la conduite : dispositif en place ou recalcul proposé (avec l'écart
 * et la stabilité), séparation de l'espace aérien, puis recalculer / appliquer.
 */
export function LiveRight() {
  const { state, run, busy } = useMissionStore();
  const { live, view, setView } = useLiveStore();
  if (!state || !live) return null;

  const { mission } = state;
  const pending = live.pendingRecompute;
  const showPending = view === 'pending' && !!pending;
  const applied = state.proposals.find((p) => p.id === live.proposalId);

  // Le recalcul en conduite ne porte que sur la phase courante : metricsByPhase[0].
  const metrics = showPending ? pending.metricsByPhase[0] : live.metrics;
  const assignments = showPending
    ? pending.assignments.filter((a) => a.phase === live.phase)
    : live.assignments;
  const diagnostics = phaseDiagnostics(
    (showPending ? pending.diagnostics : applied?.diagnostics) ?? [],
    live.phase,
  );

  return (
    <>
      <div className="side-scroll">
        <div className="segmented" role="group" aria-label="Dispositif affiché">
          <button
            className={!showPending ? 'active' : ''}
            aria-pressed={!showPending}
            onClick={() => setView('current')}
          >
            Dispositif en place
          </button>
          <button
            className={showPending ? 'active' : ''}
            aria-pressed={showPending}
            disabled={!pending}
            onClick={() => setView('pending')}
          >
            Recalcul proposé
          </button>
        </div>

        <div className="proposal-title">
          <h2>{showPending ? 'Recalcul proposé' : (applied?.label ?? 'Dispositif en place')}</h2>
          {mission.phaseCount > 1 && <span className="pill">Phase {live.phase + 1}</span>}
        </div>

        {metrics && (
          <KpiGrid
            metrics={metrics}
            stability={showPending ? pending.stability : undefined}
            compare={showPending ? live.metrics : undefined}
          />
        )}

        {showPending && pending.stability && pending.stability.summary.length > 0 && (
          <ul className="stability-summary">
            {pending.stability.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}

        <SeparationCard
          assignments={assignments}
          diagnostics={diagnostics}
          infeasible={showPending && pending.status === 'infaisable'}
        />
      </div>

      <footer className="side-foot">
        <button
          className="recompute"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.recompute(mission.id);
              setView('pending');
            })
          }
        >
          Recalculer
        </button>
        <button
          className="validate"
          disabled={busy || !pending || pending.status === 'infaisable'}
          title={!pending ? 'Recalculez d’abord le dispositif' : undefined}
          onClick={() =>
            pending &&
            run(async () => {
              await api.acceptRecompute(mission.id, pending.id);
              setView('current');
            })
          }
        >
          Appliquer le dispositif
        </button>
      </footer>
    </>
  );
}
