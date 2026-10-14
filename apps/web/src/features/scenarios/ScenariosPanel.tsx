import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { MetricsCard } from '../../components/MetricsCard';
import { useScenarioStore } from './store';

/**
 * Étape « Propositions » : plusieurs propositions côte à côte, modifiables et relançables.
 * TODO(P6) : vue de comparaison détaillée, tri, export, édition des positions (drag → editProposal).
 */
export function ScenariosPanel() {
  const { state, setState, run, busy } = useMissionStore();
  const { selectedId, select, phase, setPhase } = useScenarioStore();
  if (!state) return null;
  const { mission, proposals } = state;
  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0];

  return (
    <section>
      <div className="phase-tabs">
        {[...Array(mission.phaseCount).keys()].map((p) => (
          <button key={p} className={p === phase ? 'active' : ''} onClick={() => setPhase(p)}>
            Phase {p + 1}
          </button>
        ))}
      </div>

      {proposals.map((p) => (
        <article
          key={p.id}
          className={`proposal ${p.id === selected?.id ? 'selected' : ''}`}
          onClick={() => select(p.id)}
        >
          <header>
            <b>{p.label}</b>
            <span className={`status ${p.status}`}>{p.status}</span>
          </header>
          {p.metricsByPhase[phase] && <MetricsCard metrics={p.metricsByPhase[phase]} />}
          <small>{p.assignments.filter((a) => a.phase === phase).length} couple(s) engagé(s)</small>
          {p.id === selected?.id && p.diagnostics.length > 0 && (
            <ul className="diagnostics">
              {p.diagnostics.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </article>
      ))}

      <div className="actions">
        <button
          onClick={() =>
            run(async () => {
              await api.solve(mission.id);
              setState(await api.getMission(mission.id));
            })
          }
          disabled={busy}
        >
          Relancer le calcul
        </button>
        {selected && (
          <button
            className="primary"
            disabled={busy || selected.status === 'infaisable'}
            onClick={() => run(async () => setState(await api.start(mission.id, selected.id)))}
          >
            Lancer l’opération →
          </button>
        )}
      </div>
    </section>
  );
}
