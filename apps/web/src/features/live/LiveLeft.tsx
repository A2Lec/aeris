import type { MissionEvent } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { CoupleCard } from '../../components/CoupleCard';
import { useFocusStore } from '../../components/focus';
import { describeEvent } from './events';
import { useLiveStore } from './store';
import { useLiveSocket } from './useLiveSocket';
import './live.css';

/**
 * Panneau gauche de la conduite : couples engagés (déclarer indisponible, localiser),
 * réserve, événements terrain à injecter et journal de l'opération.
 */
export function LiveLeft() {
  const { state, catalog, run, busy, refresh } = useMissionStore();
  const { live, connected, zoneLevel, setZoneLevel } = useLiveStore();
  const { focusId, focus } = useFocusStore();
  useLiveSocket(state?.mission.id);
  if (!state || !live) return <p className="empty">Connexion au suivi en temps réel…</p>;

  const { mission } = state;
  // Un événement peut modifier la mission (disponibilité, zones) : on la recharge ensuite.
  const send = (ev: MissionEvent) =>
    run(async () => {
      await api.sendEvent(mission.id, ev);
      await refresh();
    });
  const engaged = new Set(live.assignments.map((a) => a.resourceId));
  const others = mission.resources.filter((r) => !engaged.has(r.id));

  return (
    <div className="side-scroll">
      <p className={`live-status ${connected ? 'on' : 'off'}`}>
        <span aria-hidden="true" />
        {connected ? 'Suivi en temps réel' : 'Reconnexion en cours'}
      </p>

      <h2>Couples engagés</h2>
      {live.assignments.length === 0 ? (
        <p className="empty">Aucun couple en vol sur cette phase.</p>
      ) : (
        live.assignments.map((a) => (
          <CoupleCard
            key={a.resourceId}
            assignment={a}
            mission={mission}
            catalog={catalog}
            focused={focusId === a.resourceId}
            onFocus={() => focus(focusId === a.resourceId ? undefined : a.resourceId)}
            onUnavailable={() => send({ type: 'resource_unavailable', resourceId: a.resourceId })}
          />
        ))
      )}

      {others.length > 0 && (
        <>
          <h3>Réserve et indisponibles</h3>
          <ul className="list reserve">
            {others.map((r) => (
              <li key={r.id}>
                <b>{r.id}</b> {mission.pilots.find((p) => p.id === r.pilotId)?.name}
                {r.available ? (
                  <span className="pill">En réserve</span>
                ) : (
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() => send({ type: 'resource_available', resourceId: r.id })}
                  >
                    Rétablir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="card events" aria-labelledby="events-title">
        <h3 id="events-title">Événements terrain</h3>
        <div className="event-row">
          <span>Nouvelle zone prioritaire</span>
          <div className="segmented" role="group" aria-label="Priorité de la zone">
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                className={zoneLevel === level ? 'active' : ''}
                aria-pressed={zoneLevel === level}
                onClick={() => setZoneLevel(zoneLevel === level ? undefined : level)}
              >
                P{level}
              </button>
            ))}
          </div>
        </div>
        {zoneLevel && (
          <p className="hint placing">
            Cliquez sur la carte pour placer la zone de priorité {zoneLevel}.
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy}
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
                  source: 'manuel',
                },
              })
            }
          >
            Simuler un coup de vent
          </button>
        </div>
      </section>

      <h3>Journal</h3>
      {live.events.length === 0 ? (
        <p className="hint">Aucun événement depuis le lancement.</p>
      ) : (
        <ol className="journal">
          {[...live.events].reverse().map((e, i) => (
            <li key={i}>
              <time>
                {new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </time>
              {describeEvent(e.event, mission)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
