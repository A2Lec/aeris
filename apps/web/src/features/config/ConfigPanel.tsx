import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConstraintKind, MissionInput, MissionState } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { WizardWindow } from '../../components/WizardWindow';
import { CONSTRAINT_COLORS, PRIORITY_COLORS } from '../../map/colors';
import { searchPlaces, type Place } from './place';
import { togglePhase, withPhaseCount, zonePhases } from './phases';
import { centreZone } from '../live/meteo';
import { formatSlotTime, fromLocalInput, phaseSlots, toLocalInput } from './period';
import { maxRedundancy, redundancyWarning } from './redundancy';
import { WIZARD_STEPS, useConfigEditorStore, type ConfigDrawMode, type WizardStep } from './store';
import './config.css';

const MAX_PHASES = 6;

const CONSTRAINT_LABELS: Record<ConstraintKind, string> = {
  interdite: 'Interdite',
  hauteur_limitee: 'Hauteur limitée',
  urbaine: 'Urbaine',
};

const PRIORITY_LABELS: Record<1 | 2 | 3, string> = { 1: 'Faible', 2: 'Moyenne', 3: 'Maximale' };

/** Enregistre une modification de la mission ouverte (zones, phases, environnement…). */
export function useMissionUpdate() {
  const { state, setState, run } = useMissionStore();
  return (patch: Partial<MissionInput>) => {
    if (!state) return Promise.resolve(undefined);
    const { id: _id, ...input } = state.mission;
    return run(async () =>
      setState(await api.updateMission(state.mission.id, { ...input, ...patch })),
    );
  };
}

function defaultStep(state?: MissionState, hasArea = false): WizardStep {
  if (!state) return hasArea ? 1 : 0;
  return state.status === 'phasage' ? 5 : 2;
}

/**
 * Planification, une fenêtre par étape, posée sur la carte :
 * nom et lieu → zone d'intervention et environnement → zones interdites → zones urbaines
 * → zones prioritaires → phases. La mission est créée dès que la zone est tracée ; chaque
 * zone dessinée ensuite est enregistrée aussitôt.
 */
export function ConfigPanel() {
  const { state, setState, run, busy } = useMissionStore();
  const editor = useConfigEditorStore();
  const update = useMissionUpdate();
  const step = editor.step ?? defaultStep(state, !!editor.setupWorkArea);
  const mission = state?.mission;
  const name = mission?.name ?? editor.setupName;

  const open = (target: number) =>
    run(async () => {
      if (target === 5 && state?.status === 'config')
        setState(await api.setStatus(state.mission.id, 'phasage'));
      editor.setStep(target as WizardStep);
    });

  const createMission = () => {
    const workArea = editor.setupWorkArea;
    if (!workArea) return;
    void run(async () => {
      setState(
        await api.createMission({
          name: editor.setupName.trim(),
          workArea,
          environment: editor.setupEnvironment,
          maxDrones: editor.setupMaxDrones,
          phaseCount: editor.setupPhaseCount,
          gridCellM: editor.setupGridCellM,
          pilots: [],
          resources: [],
          priorityZones: [],
          constraintZones: [],
        }),
      );
      editor.setStep(2);
    });
  };

  const solve = () =>
    state &&
    run(async () => {
      await api.solve(state.mission.id);
      setState(await api.getMission(state.mission.id));
    });

  const back = step > 0 && (
    <button onClick={() => void open(step - 1)} disabled={busy}>
      Retour
    </button>
  );

  const windows: Record<WizardStep, { intro: string; body: ReactNode; next: ReactNode }> = {
    0: {
      intro: 'Nommez l’intervention et indiquez où elle a lieu : la carte s’y place.',
      body: <NameAndPlace />,
      next: (
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            void (mission && name.trim() !== mission.name
              ? update({ name: name.trim() }).then(() => open(1))
              : open(1))
          }
        >
          Continuer
        </button>
      ),
    },
    1: {
      intro:
        'Tracez le périmètre de l’intervention sur la carte : cliquez pour placer chaque sommet, puis sur le premier pour fermer.',
      body: <AreaFields />,
      next: mission ? (
        <button className="primary" disabled={busy} onClick={() => void open(2)}>
          Continuer
        </button>
      ) : (
        <button
          className="primary"
          disabled={busy || !editor.setupWorkArea || !editor.setupName.trim()}
          onClick={createMission}
        >
          Continuer
        </button>
      ),
    },
    2: {
      intro:
        'Tracez les espaces où les drones ne doivent pas voler, ou seulement à hauteur réduite. Étape facultative.',
      body: <ConstraintFields kinds={['interdite', 'hauteur_limitee']} />,
      next: (
        <button className="primary" disabled={busy} onClick={() => void open(3)}>
          Continuer
        </button>
      ),
    },
    3: {
      intro:
        'Tracez les secteurs bâtis : les hauteurs de vol y sont plus basses. Étape facultative.',
      body: <ConstraintFields kinds={['urbaine']} />,
      next: (
        <button className="primary" disabled={busy} onClick={() => void open(4)}>
          Continuer
        </button>
      ),
    },
    4: {
      intro:
        'Tracez les secteurs à surveiller en priorité et donnez à chacun son niveau d’importance.',
      body: <PriorityFields />,
      next: (
        <button className="primary" disabled={busy} onClick={() => void open(5)}>
          Continuer
        </button>
      ),
    },
    5: {
      intro:
        'Indiquez quand se déroule l’intervention et en combien de phases la découper, puis dans quelles phases chaque zone prioritaire doit être couverte.',
      body: <PhaseFields />,
      next: (
        <button className="primary" disabled={busy} onClick={() => void solve()}>
          {busy ? 'Calcul en cours…' : 'Calculer les propositions'}
        </button>
      ),
    },
  };
  const current = windows[step];

  return (
    <WizardWindow
      steps={WIZARD_STEPS}
      current={step}
      canOpen={(i) => !busy && (i <= 1 || !!mission)}
      onOpen={(i) => void open(i)}
      intro={current.intro}
      centered={step === 0}
      footer={
        <>
          {back}
          {current.next}
        </>
      }
    >
      {current.body}
    </WizardWindow>
  );
}

/** Fenêtre 1 : nom de l'intervention et lieu pour centrer la carte. */
function NameAndPlace() {
  const { state } = useMissionStore();
  const editor = useConfigEditorStore();
  const update = useMissionUpdate();
  const [draft, setDraft] = useState(state?.mission.name);
  const value = state ? (draft ?? state.mission.name) : editor.setupName;

  return (
    <>
      <label>
        Nom de l’intervention
        <input
          type="text"
          value={value}
          autoFocus
          onChange={(e) => (state ? setDraft(e.target.value) : editor.setSetupName(e.target.value))}
          onBlur={() =>
            state && draft?.trim() && draft !== state.mission.name && update({ name: draft.trim() })
          }
          placeholder="Ex. Recherche de personne, forêt de Fontainebleau"
        />
      </label>
      <PlaceSearch />
    </>
  );
}

function PlaceSearch() {
  const { setupPlace, setSetupPlace } = useConfigEditorStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController>(undefined);

  useEffect(() => {
    const q = query.trim();
    pending.current?.abort();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then((places) => {
          setResults(places);
          setError(places.length ? undefined : 'Aucun lieu trouvé : essayez le nom de la commune.');
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError')
            setError('Recherche indisponible : déplacez la carte à la main à l’étape suivante.');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (place: Place) => {
    setSetupPlace(place);
    setQuery('');
    setResults([]);
  };

  return (
    <div className="wizard-field place-search">
      <label htmlFor="place-query">Lieu de l’intervention</label>
      <input
        id="place-query"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && results[0] && choose(results[0])}
        placeholder="Commune, lieu-dit ou adresse"
        autoComplete="off"
        aria-describedby="place-status"
      />
      {results.length > 0 && (
        <ul className="place-results" role="listbox" aria-label="Lieux trouvés">
          {results.map((p) => (
            <li key={`${p.label}-${p.lng}-${p.lat}`}>
              <button role="option" aria-selected={false} onClick={() => choose(p)}>
                <b>{p.label}</b>
                {p.context && <small>{p.context}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p id="place-status" className="place-status" role="status">
        {error ??
          (setupPlace ? (
            <>
              Carte centrée sur <b>{setupPlace.label}</b>
            </>
          ) : (
            'Facultatif : sans lieu, vous placerez la carte vous-même.'
          ))}
      </p>
    </div>
  );
}

/** Bouton qui lance (ou annule) le tracé d'un polygone sur la carte. */
function DrawButton({
  mode,
  label,
  redrawLabel,
  done,
  onBefore,
}: {
  mode: ConfigDrawMode;
  label: string;
  redrawLabel?: string;
  done?: boolean;
  onBefore?: () => void;
}) {
  const { drawMode, setDrawMode, setEditing } = useConfigEditorStore();
  const busy = useMissionStore((s) => s.busy);
  const active = drawMode === mode;
  return (
    <>
      <button
        className={`draw-button ${active ? 'active' : ''}`}
        aria-pressed={active}
        disabled={busy}
        onClick={() => {
          setEditing(false);
          onBefore?.();
          setDrawMode(active ? 'idle' : mode);
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M2 12l3-9 8 3-2 8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        {active ? 'Annuler le tracé' : done && redrawLabel ? redrawLabel : label}
      </button>
      {active && (
        <p className="draw-hint" role="status">
          Cliquez sur la carte pour placer les sommets, puis sur le premier sommet pour fermer la
          zone.
        </p>
      )}
    </>
  );
}

/** Retouche des tracés existants : on déplace les sommets directement sur la carte. */
function EditToggle() {
  const { editing, setEditing, setDrawMode } = useConfigEditorStore();
  const busy = useMissionStore((s) => s.busy);
  return (
    <button
      className={`draw-button ${editing ? 'active' : ''}`}
      aria-pressed={editing}
      disabled={busy}
      onClick={() => {
        setDrawMode('idle');
        setEditing(!editing);
      }}
    >
      {editing ? 'Terminer la retouche' : 'Retoucher les tracés sur la carte'}
    </button>
  );
}

/** Zone d'intervention, environnement et plafond de l'arrêté. */
export function AreaFields() {
  const { state } = useMissionStore();
  const editor = useConfigEditorStore();
  const update = useMissionUpdate();
  const mission = state?.mission;
  const environment = mission?.environment ?? editor.setupEnvironment;
  const maxDrones = mission?.maxDrones ?? editor.setupMaxDrones;

  return (
    <>
      <DrawButton
        mode={mission ? 'workArea' : 'setupWorkArea'}
        label="Tracer la zone d’intervention"
        redrawLabel="Retracer la zone d’intervention"
        done={!!mission || !!editor.setupWorkArea}
      />
      {mission && <EditToggle />}
      {!mission && editor.setupWorkArea && (
        <p className="config-ready">Zone d’intervention tracée</p>
      )}

      <div className="wizard-field">
        <span id="env-label">Type d’environnement</span>
        <div className="segmented" role="group" aria-labelledby="env-label">
          {(['rural', 'urbain'] as const).map((env) => (
            <button
              key={env}
              className={environment === env ? 'active' : ''}
              aria-pressed={environment === env}
              onClick={() =>
                mission ? void update({ environment: env }) : editor.setSetupEnvironment(env)
              }
            >
              {env === 'rural' ? 'Rural' : 'Urbain'}
            </button>
          ))}
        </div>
        <small className="hint">
          Fixe les hauteurs de vol autorisées pour chaque niveau de télépilote.
        </small>
      </div>

      <label>
        Drones maximum autorisés par l’arrêté
        <input
          type="number"
          min={0}
          value={maxDrones}
          onChange={(e) => {
            const n = Math.max(0, Math.floor(Number(e.target.value)));
            if (mission) void update({ maxDrones: n });
            else editor.setSetupMaxDrones(n);
          }}
        />
      </label>
    </>
  );
}

/** Zones contraintes d'un ou plusieurs types : tracé, liste, suppression. */
export function ConstraintFields({ kinds }: { kinds: ConstraintKind[] }) {
  const { state, busy } = useMissionStore();
  const editor = useConfigEditorStore();
  const update = useMissionUpdate();
  const zones = state?.mission.constraintZones.filter((z) => kinds.includes(z.kind)) ?? [];
  const kind = kinds.includes(editor.constraintKind) ? editor.constraintKind : kinds[0];
  const count = zones.length;
  const { setZoneName } = editor;
  useEffect(() => setZoneName(''), [count, setZoneName]);
  if (!state) return null;

  return (
    <>
      {kinds.length > 1 && (
        <div className="wizard-field">
          <span id="kind-label">Type de zone</span>
          <div className="segmented" role="group" aria-labelledby="kind-label">
            {kinds.map((k) => (
              <button
                key={k}
                className={kind === k ? 'active' : ''}
                aria-pressed={kind === k}
                onClick={() => editor.setConstraintKind(k)}
              >
                {CONSTRAINT_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
      )}
      <label>
        Nom de la zone
        <input
          type="text"
          value={editor.zoneName}
          onChange={(e) => editor.setZoneName(e.target.value)}
          placeholder={`${CONSTRAINT_LABELS[kind]} ${count + 1}`}
        />
      </label>
      <DrawButton
        mode="constraint"
        label={`Tracer une zone ${CONSTRAINT_LABELS[kind].toLowerCase()}`}
        onBefore={() => {
          editor.setConstraintKind(kind);
          if (!editor.zoneName.trim())
            editor.setZoneName(`${CONSTRAINT_LABELS[kind]} ${count + 1}`);
        }}
      />
      <ZoneList
        empty="Aucune zone tracée."
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          color: CONSTRAINT_COLORS[z.kind],
          detail: kinds.length > 1 ? CONSTRAINT_LABELS[z.kind] : undefined,
        }))}
        disabled={busy}
        onRemove={(id) =>
          update({ constraintZones: state.mission.constraintZones.filter((z) => z.id !== id) })
        }
      />
      {count > 0 && <EditToggle />}
    </>
  );
}

/** Nombre de drones voulus simultanément sur une zone : − / valeur / +, de 1 à `max`. */
function RedundancyStepper({
  value,
  max,
  disabled,
  label,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  label: string;
  onChange: (n: number) => void;
}) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button
        className="small"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Un drone de moins"
      >
        −
      </button>
      <output>{value}</output>
      <button
        className="small"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Un drone de plus"
      >
        +
      </button>
    </span>
  );
}

/** Zones prioritaires : niveau d'importance, drones voulus, tracé, liste. */
export function PriorityFields() {
  const { state, busy, catalog } = useMissionStore();
  const editor = useConfigEditorStore();
  const update = useMissionUpdate();
  const zones = state?.mission.priorityZones ?? [];
  const count = zones.length;
  const { setZoneName } = editor;
  useEffect(() => setZoneName(''), [count, setZoneName]);
  if (!state) return null;
  const { mission } = state;
  const drones = catalog?.drones ?? [];
  const max = maxRedundancy(mission);
  const nextWarning = redundancyWarning(mission, drones, {
    redundancy: editor.priorityRedundancy,
    requires: {},
  });
  const setRedundancy = (id: string, redundancy: number) =>
    update({
      priorityZones: mission.priorityZones.map((z) => (z.id === id ? { ...z, redundancy } : z)),
    });

  return (
    <>
      <div className="wizard-field">
        <span id="level-label">Niveau de priorité</span>
        <div className="segmented" role="group" aria-labelledby="level-label">
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              className={editor.priorityLevel === level ? 'active' : ''}
              aria-pressed={editor.priorityLevel === level}
              onClick={() => editor.setPriorityLevel(level)}
            >
              {level} {PRIORITY_LABELS[level]}
            </button>
          ))}
        </div>
      </div>
      <div className="wizard-field">
        <span>Drones voulus en même temps sur la zone</span>
        <RedundancyStepper
          label="Drones voulus en même temps sur la zone"
          value={Math.min(editor.priorityRedundancy, max)}
          max={max}
          onChange={editor.setPriorityRedundancy}
        />
        <small className="hint">
          Au-delà de 1 : plusieurs angles de vue, ou relève sans trou. Borné par l’arrêté.
        </small>
        {nextWarning && <div className="notice warn">{nextWarning}</div>}
      </div>
      <label>
        Nom de la zone
        <input
          type="text"
          value={editor.zoneName}
          onChange={(e) => editor.setZoneName(e.target.value)}
          placeholder={`Zone prioritaire ${count + 1}`}
        />
      </label>
      <DrawButton mode="priority" label="Tracer une zone prioritaire" />
      <ZoneList
        empty="Aucune zone prioritaire : le solveur couvrira la zone d’intervention de façon uniforme."
        zones={zones.map((z) => {
          const warning = redundancyWarning(mission, drones, z);
          return {
            id: z.id,
            name: z.name,
            color: PRIORITY_COLORS[z.level],
            detail: `Priorité ${z.level} · ${z.redundancy} drone${z.redundancy > 1 ? 's' : ''}`,
            extra: (
              <>
                <RedundancyStepper
                  label={`Drones voulus sur ${z.name}`}
                  value={z.redundancy}
                  max={Math.max(max, z.redundancy)}
                  disabled={busy}
                  onChange={(n) => setRedundancy(z.id, n)}
                />
                {warning && <div className="notice warn">{warning}</div>}
              </>
            ),
          };
        })}
        disabled={busy}
        onRemove={(id) =>
          update({ priorityZones: state.mission.priorityZones.filter((z) => z.id !== id) })
        }
      />
      {count > 0 && <EditToggle />}
    </>
  );
}

function ZoneList({
  zones,
  empty,
  disabled,
  onRemove,
}: {
  zones: { id: string; name: string; color: string; detail?: string; extra?: ReactNode }[];
  empty: string;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="zone-list">
      {zones.length === 0 && <li className="empty">{empty}</li>}
      {zones.map((z) => (
        <li key={z.id}>
          <span className="swatch" style={{ color: z.color }} aria-hidden="true" />
          <span className="zone-name">{z.name}</span>
          {z.detail && <small className="hint">{z.detail}</small>}
          {z.extra}
          <button
            className="small"
            disabled={disabled}
            onClick={() => onRemove(z.id)}
            aria-label={`Supprimer ${z.name}`}
          >
            Supprimer
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Période de l'intervention : les phases la découpent en parts égales. Chaque créneau dit si
 * la phase se déroule de jour ou de nuit, ce que la météo de conduite applique phase par phase.
 */
function PeriodFields() {
  const { state, busy } = useMissionStore();
  const update = useMissionUpdate();
  const [draft, setDraft] = useState<{ start?: string; end?: string }>({});
  if (!state) return null;
  const { mission } = state;
  const start = draft.start ?? (mission.period ? toLocalInput(mission.period.start) : '');
  const end = draft.end ?? (mission.period ? toLocalInput(mission.period.end) : '');
  const [lng, lat] = centreZone(mission);
  const slots = phaseSlots(mission, lat, lng);
  const invalid = !!start && !!end && Date.parse(end) <= Date.parse(start);

  const save = (next: { start: string; end: string }) => {
    setDraft(next);
    const s = fromLocalInput(next.start);
    const e = fromLocalInput(next.end);
    if (s && e && Date.parse(e) > Date.parse(s)) void update({ period: { start: s, end: e } });
  };

  return (
    <div className="wizard-field period">
      <span id="period-label">Période de l’intervention</span>
      <div className="period-inputs" role="group" aria-labelledby="period-label">
        <label>
          Début
          <input
            type="datetime-local"
            value={start}
            disabled={busy}
            onChange={(e) => save({ start: e.target.value, end })}
          />
        </label>
        <label>
          Fin
          <input
            type="datetime-local"
            value={end}
            min={start || undefined}
            disabled={busy}
            onChange={(e) => save({ start, end: e.target.value })}
          />
        </label>
      </div>
      {invalid ? (
        <p className="notice danger" role="alert">
          La fin doit être après le début.
        </p>
      ) : slots.length === 0 ? (
        <small className="hint">
          Sans période, toutes les phases sont considérées de jour pour la météo.
        </small>
      ) : (
        <ol className="phase-slots">
          {slots.map((slot) => (
            <li key={slot.phase}>
              <b>Phase {slot.phase + 1}</b>
              <span>
                {formatSlotTime(slot.start)} – {formatSlotTime(slot.end, slot.start)}
              </span>
              <span
                className={`pill ${slot.day ? 'day' : 'night'}`}
                title="Jour ou nuit aéronautique au milieu de la phase"
              >
                {slot.day ? 'Jour' : 'Nuit'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Période, nombre de phases, puis présence de chaque zone prioritaire par phase. */
function PhaseFields() {
  const { state, busy } = useMissionStore();
  const update = useMissionUpdate();
  if (!state) return null;
  const { mission } = state;
  const phases = [...Array(mission.phaseCount).keys()];

  return (
    <>
      <div className="wizard-field">
        <span id="phase-count-label">Nombre de phases</span>
        <div className="segmented" role="group" aria-labelledby="phase-count-label">
          {[...Array(MAX_PHASES).keys()].map((i) => (
            <button
              key={i}
              className={mission.phaseCount === i + 1 ? 'active' : ''}
              aria-pressed={mission.phaseCount === i + 1}
              disabled={busy}
              onClick={() =>
                update({
                  phaseCount: i + 1,
                  priorityZones: withPhaseCount(mission.priorityZones, i + 1),
                })
              }
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <PeriodFields />

      {mission.priorityZones.length === 0 ? (
        <p className="hint">Aucune zone prioritaire à répartir entre les phases.</p>
      ) : (
        <div className="phase-grid-wrap">
          <table className="phase-grid">
            <caption className="sr-only">Présence des zones prioritaires par phase</caption>
            <thead>
              <tr>
                <th scope="col">Zone</th>
                {phases.map((p) => (
                  <th key={p} scope="col">
                    Phase {p + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mission.priorityZones.map((zone) => {
                const active = zonePhases(zone, mission.phaseCount);
                return (
                  <tr key={zone.id}>
                    <th scope="row">
                      <span
                        className="swatch"
                        style={{ color: PRIORITY_COLORS[zone.level] }}
                        aria-hidden="true"
                      />
                      {zone.name}
                    </th>
                    {phases.map((p) => {
                      const checked = active.includes(p);
                      return (
                        <td key={p}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || (checked && active.length === 1)}
                            aria-label={`${zone.name}, phase ${p + 1}`}
                            onChange={(e) =>
                              update({
                                priorityZones: mission.priorityZones.map((z) =>
                                  z.id === zone.id
                                    ? togglePhase(z, p, e.currentTarget.checked, mission.phaseCount)
                                    : z,
                                ),
                              })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {mission.phaseCount > 1 && (
        <p className="hint">La carte montre les zones de la phase choisie dans le bandeau.</p>
      )}
    </>
  );
}
