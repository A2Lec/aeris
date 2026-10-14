import type { MissionInput } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';

/**
 * Étapes « Configuration » et « Phasage ».
 * TODO(P5) :
 *  - dessiner la zone de travail, les zones prioritaires/contraintes et les zones limites
 *    (leaflet-geoman, déjà installé) puis api.updateMission ;
 *  - formulaire couples télépilote + drone (catalogue dans useMissionStore().catalog) ;
 *  - saisie de l'arrêté (périmètre, période, nombre max de drones) ;
 *  - affectation des zones prioritaires aux phases.
 */
export function ConfigPanel() {
  const { state, catalog, setState, run, busy } = useMissionStore();

  const loadDemo = () =>
    run(async () => setState(await api.createMission(await api.demoMission())));

  if (!state) {
    return (
      <section>
        <p>Aucune mission. Commencez par la mission de démonstration.</p>
        <button onClick={loadDemo} disabled={busy}>
          Charger la mission de démo
        </button>
      </section>
    );
  }

  const { mission, status } = state;
  const update = (patch: Partial<MissionInput>) =>
    run(async () => {
      const { id: _id, ...input } = mission;
      setState(await api.updateMission(mission.id, { ...input, ...patch }));
    });
  const modelName = (id: string) => catalog?.drones.find((d) => d.id === id)?.name ?? id;

  return (
    <section>
      <h2>{mission.name}</h2>
      <label>
        Drones max (arrêté)
        <input
          type="number"
          min={0}
          value={mission.maxDrones}
          onChange={(e) => update({ maxDrones: Number(e.target.value) })}
        />
      </label>

      {status === 'phasage' && (
        <label>
          Nombre de phases
          <input
            type="number"
            min={1}
            max={6}
            value={mission.phaseCount}
            onChange={(e) => update({ phaseCount: Number(e.target.value) })}
          />
        </label>
      )}

      <h3>Couples télépilote / drone</h3>
      <ul className="list">
        {mission.resources.map((r) => {
          const p = mission.pilots.find((x) => x.id === r.pilotId);
          return (
            <li key={r.id}>
              <b>{r.id}</b> {p?.name} ({p?.level}) — {modelName(r.droneModelId)}
              {r.allowedArea && <em> · zone limite</em>}
              {r.fixedPosition && <em> · position imposée</em>}
            </li>
          );
        })}
      </ul>

      <h3>Zones prioritaires</h3>
      <ul className="list">
        {mission.priorityZones.map((z) => (
          <li key={z.id}>
            P{z.level} — {z.name}
            {z.phases?.length ? <em> · phase(s) {z.phases.map((p) => p + 1).join(', ')}</em> : null}
          </li>
        ))}
      </ul>

      <div className="actions">
        {status === 'config' ? (
          <button
            onClick={() => run(async () => setState(await api.setStatus(mission.id, 'phasage')))}
          >
            Phasage →
          </button>
        ) : (
          <button
            onClick={() =>
              run(async () => {
                await api.solve(mission.id);
                setState(await api.getMission(mission.id));
              })
            }
            disabled={busy}
          >
            {busy ? 'Calcul…' : 'Calculer les propositions →'}
          </button>
        )}
      </div>
    </section>
  );
}
