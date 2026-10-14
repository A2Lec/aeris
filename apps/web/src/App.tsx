import type { MissionStatus } from '@aeris/shared';
import { api } from './api/client';
import { useMissionStore } from './app/missionStore';
import { MapView } from './map/MapView';
import { MissionLayers } from './map/layers/MissionLayers';
import { MissionSetupLayer } from './map/layers/MissionSetupLayer';
import { ConfigPanel } from './features/config/ConfigPanel';
import { ScenariosPanel } from './features/scenarios/ScenariosPanel';
import { ScenarioLayers } from './features/scenarios/ScenarioLayers';
import { useScenarioStore } from './features/scenarios/store';
import { LivePanel } from './features/live/LivePanel';
import { LiveLayers } from './features/live/LiveLayers';

const STEPS: { id: MissionStatus; label: string }[] = [
  { id: 'config', label: 'Configuration' },
  { id: 'phasage', label: 'Phasage' },
  { id: 'propositions', label: 'Propositions' },
  { id: 'conduite', label: 'Conduite' },
];

/** Assemblage uniquement : carte plein écran, barre du haut, panneaux de chaque fonctionnalité. */
export function App() {
  const { state, error, setState, run } = useMissionStore();
  const minimized = useScenarioStore((s) => s.minimized);
  const status = state?.status ?? 'config';
  const current = STEPS.findIndex((s) => s.id === status);

  const goTo = (target: MissionStatus) =>
    state &&
    target !== 'conduite' &&
    status !== 'conduite' &&
    (target !== 'propositions' || state.proposals.length > 0) &&
    run(async () => setState(await api.setStatus(state.mission.id, target)));

  // La carte s'assombrit derrière la fenêtre de choix des propositions.
  const dimmed = status === 'propositions' && !minimized;

  return (
    <div className={`app ${dimmed ? 'dimmed' : ''}`}>
      <MapView>
        {state && (status === 'config' || status === 'phasage') && (
          <MissionLayers mission={state.mission} />
        )}
        {!state && <MissionSetupLayer />}
        {status === 'propositions' && <ScenarioLayers />}
        {status === 'conduite' && <LiveLayers />}
      </MapView>

      <header className="topbar">
        <span className="wordmark">Aeris</span>
        <span className="project">
          {state ? (
            <>
              Mission <b>{state.mission.name}</b>
            </>
          ) : (
            'Aucune mission chargée'
          )}
        </span>
        <nav className="steps" aria-label="Étapes">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={i === current ? 'active' : i < current ? 'done' : ''}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => goTo(s.id)}
              disabled={!state || s.id === 'conduite'}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
      {(status === 'config' || status === 'phasage') && (
        <aside className="panel dock">
          <ConfigPanel />
        </aside>
      )}
      {status === 'propositions' && <ScenariosPanel />}
      {status === 'conduite' && (
        <aside className="panel dock">
          <LivePanel />
        </aside>
      )}
    </div>
  );
}
