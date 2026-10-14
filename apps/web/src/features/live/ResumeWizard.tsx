import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import type { PilotLevel, Weather } from '@aeris/shared';
import { useMissionStore } from '../../app/missionStore';
import { WizardWindow } from '../../components/WizardWindow';
import { retainedProposal, type Project } from '../../components/project';
import { summarizeWeather } from '../../components/format';
import { useStartStore } from '../../components/Welcome';
import {
  AreaFields,
  ConstraintFields,
  PriorityFields,
  useMissionUpdate,
} from '../config/ConfigPanel';
import { useConfigEditorStore } from '../config/store';
import { resumeInConduite } from './resume';
import { useLiveStore } from './store';
import { MANUAL_WEATHER, editWeather, importWeather, weatherLimits } from './weather';
import './live.css';

const STEPS = ['Zones', 'Moyens disponibles', 'Météo'] as const;
type Step = 0 | 1 | 2;

interface ResumeStore {
  /** Projet importé en cours de reprise (absent = pas de reprise en cours). */
  project?: Project;
  step: Step;
  /** Disponibilité choisie pour chaque couple (absent = celle du projet). */
  available: Record<string, boolean>;
  weather?: Weather;
  begin: (project: Project) => void;
  setStep: (step: Step) => void;
  setAvailable: (id: string, available: boolean) => void;
  setWeather: (weather?: Weather) => void;
  clear: () => void;
}

export const useResumeStore = create<ResumeStore>((set) => ({
  step: 0,
  available: {},
  begin: (project) => set({ project, step: 0, available: {}, weather: undefined }),
  setStep: (step) => {
    useConfigEditorStore.getState().setStep(undefined);
    set({ step });
  },
  setAvailable: (id, available) => set((s) => ({ available: { ...s.available, [id]: available } })),
  setWeather: (weather) => set({ weather }),
  clear: () => set({ project: undefined, step: 0, available: {}, weather: undefined }),
}));

/**
 * Reprise d'une intervention enregistrée, une fenêtre par étape posée sur la carte :
 * retoucher les zones si la situation a changé → déclarer les moyens réellement disponibles
 * → importer la météo → relancer l'optimisation avec ces nouvelles contraintes.
 */
export function ResumeWizard() {
  const { state, setState, run, busy } = useMissionStore();
  const { project, step, available, weather, setStep, clear } = useResumeStore();
  const setView = useLiveStore((s) => s.setView);
  const setMode = useStartStore((s) => s.setMode);
  const [progress, setProgress] = useState<string>();
  if (!state || !project) return null;
  const saved = retainedProposal(project);

  const toPlanning = () => {
    clear();
    useConfigEditorStore.getState().setStep(2);
    setMode('planification');
  };

  const launch = () =>
    saved &&
    run(async () => {
      const next = await resumeInConduite(state, saved, { available, weather }, setProgress);
      setView('pending');
      clear();
      setMode(undefined);
      setState(next);
    }).finally(() => setProgress(undefined));

  const back = step > 0 && (
    <button onClick={() => setStep((step - 1) as Step)} disabled={busy}>
      Retour
    </button>
  );

  const windows: Record<Step, { intro: string; body: ReactNode; next: ReactNode }> = {
    0: {
      intro: saved
        ? 'Les zones enregistrées sont sur la carte. Modifiez-les si la situation a changé, sinon continuez.'
        : 'Ce projet n’a pas encore de dispositif calculé : il faut d’abord le planifier.',
      body: saved ? <ZoneTabs /> : null,
      next: saved ? (
        <button className="primary" onClick={() => setStep(1)} disabled={busy}>
          Continuer
        </button>
      ) : (
        <button className="primary" onClick={toPlanning}>
          Ouvrir en planification
        </button>
      ),
    },
    1: {
      intro:
        'Cochez les couples télépilote et drone réellement présents. Ajoutez ceux qui n’étaient pas prévus.',
      body: <MeansFields />,
      next: (
        <button className="primary" onClick={() => setStep(2)} disabled={busy}>
          Continuer
        </button>
      ),
    },
    2: {
      intro:
        'Importez la météo du secteur, corrigez-la si besoin avec les relevés du terrain, puis relancez l’optimisation.',
      body: (
        <>
          <WeatherFields />
          {progress && (
            <p className="resume-step" role="status">
              {progress}…
            </p>
          )}
        </>
      ),
      next: (
        <button className="primary" onClick={() => void launch()} disabled={busy || !saved}>
          {busy ? 'Optimisation en cours…' : 'Lancer l’optimisation'}
        </button>
      ),
    },
  };
  const current = windows[step];

  return (
    <WizardWindow
      steps={STEPS}
      current={step}
      canOpen={() => !busy && !!saved}
      onOpen={(i) => setStep(i as Step)}
      intro={current.intro}
      footer={
        <>
          {back}
          {step === 0 && saved && (
            <button onClick={toPlanning} disabled={busy}>
              Ouvrir en planification
            </button>
          )}
          {current.next}
        </>
      }
    >
      <p className="resume-project">
        <b>{state.mission.name}</b>
        <small>Enregistré le {new Date(project.savedAt).toLocaleString('fr-FR')}</small>
      </p>
      {current.body}
    </WizardWindow>
  );
}

const ZONE_TABS = ['Intervention', 'Interdites', 'Urbaines', 'Prioritaires'] as const;

/** Les mêmes outils de tracé qu'en planification, regroupés en onglets. */
function ZoneTabs() {
  const [tab, setTab] = useState(0);
  const { setDrawMode, setEditing } = useConfigEditorStore();
  return (
    <>
      <div className="segmented" role="tablist" aria-label="Zones à retoucher">
        {ZONE_TABS.map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={tab === i}
            className={tab === i ? 'active' : ''}
            onClick={() => {
              setDrawMode('idle');
              setEditing(false);
              setTab(i);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 0 && <AreaFields />}
      {tab === 1 && <ConstraintFields kinds={['interdite', 'hauteur_limitee']} />}
      {tab === 2 && <ConstraintFields kinds={['urbaine']} />}
      {tab === 3 && <PriorityFields />}
    </>
  );
}

const NEW_PILOT = '__nouveau__';

/** Couples disponibles, ajout d'un couple, plafond de l'arrêté. */
function MeansFields() {
  const { state, catalog, busy } = useMissionStore();
  const { project, available, setAvailable } = useResumeStore();
  const update = useMissionUpdate();
  const [pilotId, setPilotId] = useState(NEW_PILOT);
  const [pilotName, setPilotName] = useState('');
  const [level, setLevel] = useState<PilotLevel>('TP1');
  const [modelId, setModelId] = useState('');
  if (!state || !project) return null;
  const { mission } = state;
  const saved = retainedProposal(project);
  const engaged = new Set(saved?.assignments.map((a) => a.resourceId));
  const isOn = (id: string, fallback: boolean) => available[id] ?? fallback;
  const onResources = mission.resources.filter((r) => isOn(r.id, r.available));
  const onPilots = new Set(onResources.map((r) => r.pilotId));
  const model = modelId || catalog?.drones[0]?.id || '';
  const newPilot = pilotId === NEW_PILOT;

  const addCouple = () => {
    if (!model || (newPilot && !pilotName.trim())) return;
    const pid = newPilot ? crypto.randomUUID() : pilotId;
    void update({
      pilots: newPilot
        ? [...mission.pilots, { id: pid, name: pilotName.trim(), level }]
        : mission.pilots,
      resources: [
        ...mission.resources,
        {
          id: `r-${crypto.randomUUID().slice(0, 8)}`,
          pilotId: pid,
          droneModelId: model,
          available: true,
        },
      ],
    });
    setPilotName('');
    setPilotId(pid);
  };

  return (
    <>
      <p className="means-summary">
        <span>
          <b>{onResources.length}</b> drone(s) et <b>{onPilots.size}</b> télépilote(s) disponibles
        </span>
        <span
          className={`pill ${onResources.length > mission.maxDrones ? 'warn' : ''}`}
          title="Le solveur n’engagera pas plus de drones que l’arrêté n’en autorise"
        >
          Arrêté : {mission.maxDrones} max
        </span>
      </p>

      <ul className="resume-couples">
        {mission.pilots.map((pilot) => {
          const couples = mission.resources.filter((r) => r.pilotId === pilot.id);
          if (!couples.length) return null;
          return (
            <li key={pilot.id} className="pilot-row">
              <div className="pilot-head">
                <b>{pilot.name}</b>
                <span className={`pill ${pilot.level === 'TP1' ? 'ok' : 'info'}`}>
                  {pilot.level}
                </span>
              </div>
              {couples.map((r) => {
                const on = isOn(r.id, r.available);
                const drone = catalog?.drones.find((d) => d.id === r.droneModelId);
                return (
                  <label key={r.id} className="couple-row">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setAvailable(r.id, e.target.checked)}
                    />
                    <span>{drone?.name ?? r.droneModelId}</span>
                    {engaged.has(r.id) && <span className="pill">Engagé</span>}
                    {!on && <span className="pill danger">Absent</span>}
                  </label>
                );
              })}
            </li>
          );
        })}
      </ul>

      <fieldset className="add-couple">
        <legend>Ajouter un couple</legend>
        <label>
          Télépilote
          <select value={pilotId} onChange={(e) => setPilotId(e.target.value)}>
            <option value={NEW_PILOT}>Nouveau télépilote</option>
            {mission.pilots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.level})
              </option>
            ))}
          </select>
        </label>
        {newPilot && (
          <div className="add-pilot">
            <label>
              Nom
              <input
                type="text"
                value={pilotName}
                onChange={(e) => setPilotName(e.target.value)}
                placeholder="Nom du télépilote"
              />
            </label>
            <div className="segmented" role="group" aria-label="Niveau du télépilote">
              {(['TP1', 'TP2'] as const).map((l) => (
                <button
                  key={l}
                  className={level === l ? 'active' : ''}
                  aria-pressed={level === l}
                  onClick={() => setLevel(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        <label>
          Drone
          <select value={model} onChange={(e) => setModelId(e.target.value)}>
            {catalog?.drones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={addCouple}
          disabled={
            busy ||
            !model ||
            (newPilot
              ? !pilotName.trim()
              : mission.resources.some((r) => r.pilotId === pilotId && r.droneModelId === model))
          }
        >
          Ajouter ce couple
        </button>
      </fieldset>

      <label>
        Drones maximum autorisés par l’arrêté
        <input
          type="number"
          min={0}
          value={mission.maxDrones}
          onChange={(e) =>
            void update({ maxDrones: Math.max(0, Math.floor(Number(e.target.value))) })
          }
        />
      </label>
    </>
  );
}

const kmh = (ms: number) => Math.round(ms * 3.6);

/** Import de la météo du secteur, corrections de l'opérateur, drones hors limites. */
function WeatherFields() {
  const { state, catalog, busy } = useMissionStore();
  const { available, weather, setWeather } = useResumeStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  if (!state) return null;
  const { mission } = state;

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setWeather(await importWeather(mission.workArea));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWeather(weather ?? MANUAL_WEATHER);
    } finally {
      setLoading(false);
    }
  };
  const edit = (patch: Partial<Weather>) => weather && setWeather(editWeather(weather, patch));
  const summary = weather && summarizeWeather(weather);

  const grounded = weather
    ? mission.resources
        .filter((r) => available[r.id] ?? r.available)
        .flatMap((r) => {
          const drone = catalog?.drones.find((d) => d.id === r.droneModelId);
          const limits = drone ? weatherLimits(drone, weather) : [];
          const pilot = mission.pilots.find((p) => p.id === r.pilotId);
          return limits.length
            ? [{ id: r.id, label: `${drone?.name}, ${pilot?.name ?? r.id}`, limits }]
            : [];
        })
    : [];

  const number = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    unit: string,
    step = 1,
  ) => (
    <label className="weather-field">
      {label}
      <span className="with-unit">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) =>
            Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)
          }
        />
        <small>{unit}</small>
      </span>
    </label>
  );

  return (
    <>
      <button className="draw-button" onClick={() => void load()} disabled={busy || loading}>
        {loading
          ? 'Import en cours…'
          : weather
            ? 'Importer à nouveau la météo du secteur'
            : 'Importer la météo du secteur'}
      </button>
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}

      {!weather ? (
        <p className="hint">
          Sans import, la météo relevée par le serveur au lancement sera utilisée.
        </p>
      ) : (
        <>
          <p className={`weather-source ${summary?.caveat ? 'caveat' : ''}`}>
            {weather.source === 'api'
              ? `Relevé Open-Meteo de ${new Date(weather.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : summary?.caveat}
          </p>
          <div className="weather-grid">
            {number('Vent moyen', kmh(weather.windMs), (v) => edit({ windMs: v / 3.6 }), 'km/h')}
            {number('Rafales', kmh(weather.gustMs), (v) => edit({ gustMs: v / 3.6 }), 'km/h')}
            {number(
              'Précipitations',
              weather.precipitationMm,
              (v) => edit({ precipitationMm: Math.max(0, v) }),
              'mm',
              0.1,
            )}
            {number('Température', weather.temperatureC, (v) => edit({ temperatureC: v }), '°C')}
          </div>
          <div className="segmented" role="group" aria-label="Luminosité">
            {[true, false].map((day) => (
              <button
                key={String(day)}
                className={weather.isDay === day ? 'active' : ''}
                aria-pressed={weather.isDay === day}
                onClick={() => edit({ isDay: day })}
              >
                {day ? 'Jour' : 'Nuit'}
              </button>
            ))}
          </div>
          {grounded.length > 0 ? (
            <div className="notice warn">
              <b>Hors limites avec cette météo</b>
              <ul className="grounded">
                {grounded.map((g) => (
                  <li key={g.id}>
                    {g.label} : {g.limits.join(', ')}
                  </li>
                ))}
              </ul>
              <small>Ces drones seront écartés par l’optimisation.</small>
            </div>
          ) : (
            <p className="hint">Tous les drones disponibles peuvent voler avec cette météo.</p>
          )}
        </>
      )}
    </>
  );
}
