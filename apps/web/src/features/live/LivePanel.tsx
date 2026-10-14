import type { MissionEvent } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { MetricsCard } from '../../components/MetricsCard';
import { useLiveStore } from './store';
import { useLiveSocket } from './useLiveSocket';

/**
 * Étape « Conduite » : positions et couverture en temps réel, injection d'événements, recalcul.
 * TODO(P6) : nouvelle zone prioritaire dessinée sur la carte, journal détaillé,
 * scénarios de démo (« changements imposés en direct » par le jury).
 */
export function LivePanel() {
  const { state, run, busy, refresh } = useMissionStore();
  const { live, connected } = useLiveStore();
  useLiveSocket(state?.mission.id);
  if (!state || !live) return <p>Connexion au flux temps réel…</p>;

  const { mission } = state;
  // Un événement peut modifier la mission (disponibilité, zones) : on la recharge ensuite.
  const send = (ev: MissionEvent) =>
    run(async () => {
      await api.sendEvent(mission.id, ev);
      await refresh();
    });
  const engaged = new Set(live.assignments.map((a) => a.resourceId));

  return (
    <section>
      <p className={connected ? 'ok' : 'ko'}>
        {connected ? '● Temps réel' : '○ Reconnexion…'} — phase {live.phase + 1}/
        {mission.phaseCount}
        {live.weather && ` — vent ${live.weather.windMs} m/s (rafales ${live.weather.gustMs})`}
      </p>
      <MetricsCard metrics={live.metrics} />

      <h3>Couples</h3>
      <ul className="list">
        {mission.resources.map((r) => (
          <li key={r.id}>
            <b>{r.id}</b>{' '}
            {r.available ? (engaged.has(r.id) ? 'engagé' : 'en réserve') : 'indisponible'}
            <button
              className="small"
              onClick={() =>
                send({
                  type: r.available ? 'resource_unavailable' : 'resource_available',
                  resourceId: r.id,
                })
              }
            >
              {r.available ? 'Déclarer indisponible' : 'Rétablir'}
            </button>
          </li>
        ))}
      </ul>

      <h3>Événements</h3>
      <div className="actions">
        <button
          disabled={live.phase + 1 >= mission.phaseCount}
          onClick={() => send({ type: 'phase_changed', phase: live.phase + 1 })}
        >
          Phase suivante
        </button>
        <button
          onClick={() =>
            send({
              type: 'weather_update',
              weather: {
                windMs: 11,
                gustMs: 14,
                precipitationMm: 0.4,
                temperatureC: 12,
                isDay: true,
                fetchedAt: new Date().toISOString(),
              },
            })
          }
        >
          Simuler coup de vent + pluie
        </button>
      </div>

      <div className="actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(() => api.recompute(mission.id))}
        >
          Recalculer le dispositif
        </button>
      </div>

      {live.pendingRecompute && (
        <article className="proposal selected">
          <header>
            <b>Recalcul proposé</b>
            <span className={`status ${live.pendingRecompute.status}`}>
              {live.pendingRecompute.status}
            </span>
          </header>
          {/* Recalcul en conduite : une seule phase calculée → metricsByPhase[0]. */}
          <MetricsCard metrics={live.pendingRecompute.metricsByPhase[0]} compare={live.metrics} />
          <ul className="diagnostics">
            {live.pendingRecompute.diagnostics.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <button
            className="primary"
            onClick={() => run(() => api.acceptRecompute(mission.id, live.pendingRecompute!.id))}
          >
            Appliquer
          </button>
        </article>
      )}

      <h3>Journal</h3>
      <ol className="log">
        {[...live.events].reverse().map((e, i) => (
          <li key={i}>
            {new Date(e.at).toLocaleTimeString('fr-FR')} — {e.event.type}
          </li>
        ))}
      </ol>
    </section>
  );
}
