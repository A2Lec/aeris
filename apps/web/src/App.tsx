import type { MissionStatus } from '@aeris/shared';
import { api } from './api/client';
import { useMissionStore } from './app/missionStore';
import { MapView } from './map/MapView';
import { MissionLayers } from './map/layers/MissionLayers';
import { MissionSetupLayer } from './map/layers/MissionSetupLayer';
import { ConfigPanel } from './features/config/ConfigPanel';
import { ScenariosPanel } from './features/scenarios/ScenariosPanel';
import { ScenarioLayers } from './features/scenarios/ScenarioLayers';
import { LivePanel } from './features/live/LivePanel';
import { LiveLayers } from './features/live/LiveLayers';

const STEPS: { id: MissionStatus; label: string }[] = [
  { id: 'config', label: 'Configuration' },
  { id: 'phasage', label: 'Phasage' },
  { id: 'propositions', label: 'Propositions' },
  { id: 'conduite', label: 'Conduite' },
];

/** Assemblage uniquement : chaque fonctionnalité vit dans features/<nom>/. */
export function App() {
  const { state, error, setState, run } = useMissionStore();
  const status = state?.status ?? 'config';
  const current = STEPS.findIndex((s) => s.id === status);

  const goTo = (target: MissionStatus) =>
    state &&
    target !== 'conduite' &&
    status !== 'conduite' &&
    (target !== 'propositions' || state.proposals.length > 0) &&
    run(async () => setState(await api.setStatus(state.mission.id, target)));

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="brand">
          <h1>Aeris</h1>
          <p>Planifier · Coordonner · Couvrir</p>
        </header>
        <nav className="stepper">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={i === current ? 'active' : i < current ? 'done' : ''}
              onClick={() => goTo(s.id)}
              disabled={!state || s.id === 'conduite'}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </nav>
        {error && <p className="error">{error}</p>}
        {(status === 'config' || status === 'phasage') && <ConfigPanel />}
        {status === 'propositions' && <ScenariosPanel />}
        {status === 'conduite' && <LivePanel />}
      </aside>
      <main>
        <MapView>
          {state && (status === 'config' || status === 'phasage') && (
            <MissionLayers mission={state.mission} />
          )}
          {!state && <MissionSetupLayer />}
          {status === 'propositions' && <ScenarioLayers />}
          {status === 'conduite' && <LiveLayers />}
        </MapView>
      </main>
    </div>
  );
}
