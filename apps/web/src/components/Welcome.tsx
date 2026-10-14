import { useRef, useState } from 'react';
import { create } from 'zustand';
import { useMissionStore } from '../app/missionStore';
import { useLiveStore } from '../features/live/store';
import { openInPlanning, resumeInConduite } from '../features/live/resume';
import { parseProject, retainedProposal, type Project } from './project';
import './welcome.css';

export type StartMode = 'planification' | 'conduite';

/** Choix fait sur l'écran d'accueil (aucun = accueil affiché tant qu'il n'y a pas de mission). */
export const useStartStore = create<{ mode?: StartMode; setMode: (mode?: StartMode) => void }>(
  (set) => ({ setMode: (mode) => set({ mode }) }),
);

/**
 * Écran d'accueil : partir de rien (Planification) ou reprendre un projet enregistré
 * pour le conduire avec les moyens réellement disponibles (Conduite).
 */
export function Welcome() {
  const { mode, setMode } = useStartStore();
  return (
    <div className="welcome">
      <div className="welcome-watermark" aria-hidden="true">
        Aeris
      </div>
      <main className="welcome-content">
        <header className="welcome-brand">
          <span className="tricolore" aria-hidden="true" />
          <div>
            <h1>Aeris</h1>
            <p>Aide à la décision drones</p>
          </div>
        </header>
        {mode === 'conduite' ? (
          <ResumeProject onBack={() => setMode(undefined)} />
        ) : (
          <div className="welcome-choices">
            <button className="choice" onClick={() => setMode('planification')}>
              <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
                <path
                  d="M5 9l7-3 8 3 7-3v17l-7 3-8-3-7 3z M12 6v17 M20 9v17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              <b>Planification</b>
              <span>
                Partir de rien : tracer la zone de travail, les zones prioritaires et les
                contraintes, puis obtenir les dispositifs optimisés.
              </span>
            </button>
            <button className="choice" onClick={() => setMode('conduite')}>
              <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="16" cy="16" r="11" />
                  <circle cx="16" cy="16" r="5" />
                  <path d="M16 16l8-8" strokeLinecap="round" />
                </g>
              </svg>
              <b>Conduite</b>
              <span>
                Reprendre un projet enregistré, indiquer les pilotes et drones disponibles, et
                recalculer le dispositif.
              </span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/** Conduite : choisir le projet, puis les moyens disponibles, puis lancer. */
function ResumeProject({ onBack }: { onBack: () => void }) {
  const { catalog, setState, run, busy } = useMissionStore();
  const setView = useLiveStore((s) => s.setView);
  const setMode = useStartStore((s) => s.setMode);
  const input = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState<string>();
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [maxDrones, setMaxDrones] = useState(0);
  const [step, setStep] = useState<string>();

  const load = async (file?: File) => {
    if (!file) return;
    const { project: p, error: e } = parseProject(await file.text());
    setError(e);
    setProject(p);
    if (p) {
      setAvailable(Object.fromEntries(p.state.mission.resources.map((r) => [r.id, r.available])));
      setMaxDrones(p.state.mission.maxDrones);
    }
  };

  if (!project) {
    return (
      <section className="welcome-step">
        <h2>Reprendre un projet</h2>
        <p>Choisissez un fichier de projet enregistré depuis le menu d’Aeris (.aeris.json).</p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => void load(e.target.files?.[0])}
        />
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void load(e.dataTransfer.files[0]);
          }}
        >
          <button className="primary" onClick={() => input.current?.click()}>
            Choisir un fichier de projet
          </button>
          <small>ou déposez-le ici</small>
        </div>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <div className="welcome-nav">
          <button onClick={onBack}>Retour</button>
        </div>
      </section>
    );
  }

  const { mission } = project.state;
  const saved = retainedProposal(project);
  const engagedIds = new Set(saved?.assignments.map((a) => a.resourceId));
  const availableCount = mission.resources.filter((r) => available[r.id]).length;

  const launch = () =>
    run(async () => {
      const state = await resumeInConduite(project, { available, maxDrones }, setStep);
      setView('pending');
      setState(state);
      setMode(undefined);
    }).finally(() => setStep(undefined));

  const plan = () =>
    run(async () => {
      setState(await openInPlanning(project));
      setMode('planification');
    });

  return (
    <section className="welcome-step wide">
      <h2>{mission.name}</h2>
      <p className="hint">
        Enregistré le {new Date(project.savedAt).toLocaleString('fr-FR')}.{' '}
        {mission.priorityZones.length} zone(s) prioritaire(s), {mission.phaseCount} phase(s).
      </p>

      {!saved ? (
        <div className="notice warn">
          Ce projet n’a pas encore de dispositif calculé : il faut d’abord le planifier.
        </div>
      ) : (
        <>
          <h3>Pilotes et drones disponibles</h3>
          <ul className="resume-couples">
            {mission.resources.map((r) => {
              const pilot = mission.pilots.find((p) => p.id === r.pilotId);
              const drone = catalog?.drones.find((d) => d.id === r.droneModelId);
              const on = available[r.id] ?? r.available;
              return (
                <li key={r.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setAvailable({ ...available, [r.id]: e.target.checked })}
                    />
                    <span>
                      <b>{r.id}</b> {pilot?.name}
                      <small>{drone?.name ?? r.droneModelId}</small>
                    </span>
                  </label>
                  <span className="pills">
                    {pilot && (
                      <span className={`pill ${pilot.level === 'TP1' ? 'ok' : 'info'}`}>
                        {pilot.level}
                      </span>
                    )}
                    {engagedIds.has(r.id) && <span className="pill">Engagé</span>}
                    {!on && <span className="pill danger">Indisponible</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <label className="resume-max">
            Drones maximum autorisés par l’arrêté
            <input
              type="number"
              min={0}
              value={maxDrones}
              onChange={(e) => setMaxDrones(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <p className="hint">
            {availableCount} couple(s) disponible(s). Le dispositif enregistré est restauré, puis
            recalculé avec ces moyens ; vous validerez le résultat en conduite.
          </p>
        </>
      )}

      {step && (
        <p className="resume-step" role="status">
          {step}…
        </p>
      )}

      <div className="welcome-nav">
        <button
          onClick={() => {
            setProject(undefined);
            setError(undefined);
          }}
          disabled={busy}
        >
          Changer de projet
        </button>
        <button onClick={plan} disabled={busy}>
          Ouvrir en planification
        </button>
        {saved && (
          <button className="primary" onClick={launch} disabled={busy || availableCount === 0}>
            Lancer la conduite
          </button>
        )}
      </div>
    </section>
  );
}
