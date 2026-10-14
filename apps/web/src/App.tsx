import { useMissionStore } from './app/missionStore';
import { MapView } from './map/MapView';
import { MissionLayers } from './map/layers/MissionLayers';
import { MissionSetupLayer } from './map/layers/MissionSetupLayer';
import { Topbar } from './components/Topbar';
import { Legend } from './components/Legend';
import { ConfigPanel } from './features/config/ConfigPanel';
import { ScenariosPanel } from './features/scenarios/ScenariosPanel';
import { ScenarioLayers } from './features/scenarios/ScenarioLayers';
import { useScenarioStore } from './features/scenarios/store';
import { LiveLeft } from './features/live/LiveLeft';
import { LiveRight } from './features/live/LiveRight';
import { LiveLayers } from './features/live/LiveLayers';
import { useLiveStore } from './features/live/store';
import './theme';

/**
 * Assemblage uniquement : bandeau, panneau gauche, carte, panneau droit. En Propositions,
 * la carte prend toute la largeur et les fenêtres de l'étape sont posées dessus.
 * Chaque bloc vit dans sa fonctionnalité (features/<nom>) ou dans components/.
 */
export function App() {
  const { state, error } = useMissionStore();
  const { phase, selectedId, minimized } = useScenarioStore();
  const live = useLiveStore((s) => s.live);
  const status = state?.status ?? 'config';
  const preparing = status === 'config' || status === 'phasage';
  // Propositions : carte pleine largeur, fenêtres posées dessus (assombrie tant qu'elles sont ouvertes).
  const proposing = status === 'propositions';
  const layout = proposing ? 'no-sides' : preparing ? 'no-right' : '';

  // Communes concernées : métriques de la phase affichée (proposition ou conduite).
  const selected = state?.proposals.find((p) => p.id === selectedId) ?? state?.proposals[0];
  const communes =
    status === 'conduite'
      ? live?.metrics.communes
      : status === 'propositions'
        ? selected?.metricsByPhase[phase]?.communes
        : undefined;

  return (
    <div className={`app ${layout}`}>
      <Topbar />

      {!proposing && (
        <aside className="side side-left" aria-label="Panneau de travail">
          {preparing && (
            <div className="side-scroll">
              <ConfigPanel />
            </div>
          )}
          {status === 'conduite' && <LiveLeft />}
        </aside>
      )}

      <main className={`map-area ${proposing && !minimized ? 'dimmed' : ''}`}>
        <MapView>
          {state && preparing && (
            <MissionLayers
              mission={state.mission}
              phase={status === 'phasage' ? phase : undefined}
            />
          )}
          {!state && <MissionSetupLayer />}
          {status === 'propositions' && <ScenarioLayers />}
          {status === 'conduite' && <LiveLayers />}
        </MapView>
        {proposing && <ScenariosPanel />}
        {state && !(proposing && !minimized) && (
          <Legend withCoverage={!preparing} communes={communes} />
        )}
        {error && (
          <p className="toast" role="alert">
            {error}
          </p>
        )}
      </main>

      {status === 'conduite' && (
        <aside className="side side-right" aria-label="Évaluation et décision">
          <LiveRight />
        </aside>
      )}
    </div>
  );
}
