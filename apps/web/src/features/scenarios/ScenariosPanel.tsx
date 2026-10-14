import { useEffect } from 'react';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { MetricsCard } from '../../components/MetricsCard';
import { resourceColor } from '../../map/colors';
import { CompareTable } from './CompareTable';
import { STATUS_LABELS, columnLabels } from './compare';
import { applyMoves, moveKey } from './draft';
import { useScenarioStore } from './store';
import './scenarios.css';

/**
 * Étape « Propositions » : proposition retenue à gauche, comparaison en lecture seule à droite.
 * La fenêtre se réduit pour retoucher les positions sur la carte ; au retour, l'opérateur
 * recalcule la couverture de la proposition ou annule ses déplacements.
 * TODO(P6) : export du dispositif retenu.
 */
export function ScenariosPanel() {
  const { state, catalog, setState, run, busy } = useMissionStore();
  const { selectedId, select, phase, setPhase, minimized, setMinimized, draft, clearDraft } =
    useScenarioStore();

  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMinimized(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [minimized, setMinimized]);

  if (!state) return null;
  const { mission, proposals } = state;
  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0];
  const moves = draft && draft.proposalId === selected?.id ? draft.moves : {};
  const pending = Object.keys(moves).length;
  const inPhase = selected?.assignments.filter((a) => a.phase === phase) ?? [];
  const resourceIds = mission.resources.map((r) => r.id);
  const labels = columnLabels(proposals);
  const modelName = (id: string) => catalog?.drones.find((d) => d.id === id)?.name ?? id;

  const phaseTabs = mission.phaseCount > 1 && (
    <div className="phase-tabs" role="group" aria-label="Phase affichée">
      {[...Array(mission.phaseCount).keys()].map((p) => (
        <button
          key={p}
          className={p === phase ? 'active' : ''}
          aria-pressed={p === phase}
          onClick={() => setPhase(p)}
        >
          Phase {p + 1}
        </button>
      ))}
    </div>
  );

  const solveAgain = () =>
    run(async () => {
      clearDraft();
      await api.solve(mission.id);
      setState(await api.getMission(mission.id));
    });

  const applyDraft = () =>
    selected &&
    run(async () => {
      await api.editProposal(mission.id, selected.id, applyMoves(selected.assignments, moves));
      clearDraft();
      setState(await api.getMission(mission.id));
    });

  // Même bouton, même place pour réduire et rouvrir : seule la flèche s'inverse.
  const toggle = (
    <button
      className={`window-toggle ${minimized ? 'floating' : ''}`}
      onClick={() => setMinimized(!minimized)}
      aria-expanded={!minimized}
      title={minimized ? 'Rouvrir les propositions' : 'Réduire pour voir le plan (Échap)'}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d={minimized ? 'M3 6l5 5 5-5' : 'M3 10l5-5 5 5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      <span>{selected?.label ?? 'Aucune proposition'}</span>
      {minimized && pending > 0 && <em>{pending} à recalculer</em>}
    </button>
  );

  if (minimized) {
    return (
      <div className="restore">
        {toggle}
        {phaseTabs}
      </div>
    );
  }

  return (
    <>
      {toggle}
      <section className="panel compare-panel" aria-labelledby="compare-title">
        <header className="panel-head">
          <h2 id="compare-title">Comparaison</h2>
          {phaseTabs}
        </header>
        {proposals.length === 0 ? (
          <p className="empty">Aucune proposition à comparer.</p>
        ) : (
          <>
            <CompareTable proposals={proposals} selectedId={selected?.id} phase={phase} />
            <p className="legend">
              En vert, la meilleure valeur de la phase. Survolez une colonne pour son nom complet.
            </p>
          </>
        )}
      </section>

      <section className="panel proposal-panel" aria-label="Proposition retenue">
        {proposals.length > 0 && (
          <div className="switcher" role="group" aria-label="Proposition affichée">
            {proposals.map((p) => (
              <button
                key={p.id}
                className={p.id === selected?.id ? 'active' : ''}
                aria-pressed={p.id === selected?.id}
                disabled={pending > 0 && p.id !== selected?.id}
                title={pending > 0 ? 'Recalculez ou annulez les déplacements d’abord' : p.label}
                onClick={() => select(p.id)}
              >
                {labels.get(p.id)}
              </button>
            ))}
          </div>
        )}

        {pending > 0 && (
          <div className="draft-bar" role="status">
            <p>
              {pending === 1 ? '1 position déplacée' : `${pending} positions déplacées`} sur le
              plan.
            </p>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={applyDraft}>
                Recalculer la couverture
              </button>
              <button className="quiet" disabled={busy} onClick={clearDraft}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {!selected ? (
          <div className="empty">
            <p>Aucune proposition. Relancez le calcul pour en obtenir.</p>
          </div>
        ) : (
          <>
            <p className="proposal-status">
              <span className={`status ${selected.status}`}>{STATUS_LABELS[selected.status]}</span>
              {pending === 0 && (
                <small>Réduisez la fenêtre pour déplacer les pilotes sur le plan.</small>
              )}
            </p>
            {selected.metricsByPhase[phase] && (
              <MetricsCard metrics={selected.metricsByPhase[phase]} />
            )}

            <h3>Couples engagés{mission.phaseCount > 1 && `, phase ${phase + 1}`}</h3>
            {inPhase.length === 0 ? (
              <small>Aucun couple engagé sur cette phase.</small>
            ) : (
              <ul className="list couples">
                {inPhase.map((a) => {
                  const res = mission.resources.find((r) => r.id === a.resourceId);
                  const pilot = mission.pilots.find((p) => p.id === res?.pilotId);
                  const moved = moves[moveKey(a.resourceId, a.phase)] !== undefined;
                  return (
                    <li key={a.resourceId}>
                      <i
                        className="swatch"
                        style={{ background: resourceColor(a.resourceId, resourceIds) }}
                      />
                      <div>
                        <b>{a.resourceId}</b> {pilot?.name}, {pilot?.level}
                        {moved && <em className="moved">déplacé</em>}
                        <small>
                          {res ? modelName(res.droneModelId) : 'Drone inconnu'}, rayon{' '}
                          {a.radiusM / 1000} km, {a.altitude.minM} à {a.altitude.maxM} m/sol
                        </small>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected.diagnostics.length > 0 && (
              <>
                <h3>Alertes</h3>
                <ul className="diagnostics">
                  {selected.diagnostics.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <footer className="proposal-actions">
          <button className="quiet" disabled={busy} onClick={solveAgain}>
            Relancer le calcul
          </button>
          {selected && (
            <button
              className="quiet"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  clearDraft();
                  setState(await api.deleteProposal(mission.id, selected.id));
                })
              }
            >
              Supprimer
            </button>
          )}
          {selected && (
            <button
              className="primary"
              disabled={busy || pending > 0 || selected.status === 'infaisable'}
              title={pending > 0 ? 'Recalculez ou annulez les déplacements d’abord' : undefined}
              onClick={() => run(async () => setState(await api.start(mission.id, selected.id)))}
            >
              Lancer l’opération
            </button>
          )}
        </footer>
      </section>
    </>
  );
}
