import type { MissionStatus } from '@aeris/shared';
import { api } from '../api/client';
import { useMissionStore } from '../app/missionStore';
import { BASEMAPS, useBasemapStore } from '../map/basemap';
import { useLiveStore } from '../features/live/store';
import { useScenarioStore } from '../features/scenarios/store';
import { engagedCount } from '../features/scenarios/compare';
import { AppMenu, useMenuStore } from './AppMenu';
import { summarizeWeather } from './format';
import { formatSlotTime, phaseSlots } from '../features/config/period';
import { centreZone } from '../features/live/meteo';
import './components.css';

const STEPS: { id: MissionStatus; label: string }[] = [
  { id: 'config', label: 'Configuration' },
  { id: 'phasage', label: 'Phasage' },
  { id: 'propositions', label: 'Propositions' },
  { id: 'conduite', label: 'Conduite' },
];

/**
 * Bandeau unique : identité, étape du cycle de vie, phase active, conformité à l'arrêté,
 * météo de la phase et fond de carte. Le bloc logo + nom ouvre le menu latéral (thème…).
 * Tout est lu dans les stores existants.
 */
export function Topbar() {
  const { state, setState, run, refresh, busy } = useMissionStore();
  const { phase: viewPhase, setPhase, selectedId } = useScenarioStore();
  const live = useLiveStore((s) => s.live);
  const { basemap, setBasemap } = useBasemapStore();
  const { open: menuOpen, setOpen: setMenuOpen } = useMenuStore();

  const status = state?.status ?? 'config';
  const current = STEPS.findIndex((s) => s.id === status);
  const mission = state?.mission;
  const inLive = status === 'conduite' && !!live;
  const phase = inLive ? live.phase : viewPhase;

  // Retour en arrière uniquement ; Propositions exige un calcul, Conduite se lance depuis le panneau.
  const canGo = (target: MissionStatus) =>
    !!state &&
    target !== status &&
    target !== 'conduite' &&
    status !== 'conduite' &&
    (target !== 'propositions' || state.proposals.length > 0);
  const goTo = (target: MissionStatus) =>
    state && run(async () => setState(await api.setStatus(state.mission.id, target)));

  // En conduite, changer de phase est un événement réel ; sinon c'est la phase affichée.
  const choosePhase = (p: number) =>
    inLive && state
      ? run(async () => {
          await api.sendEvent(state.mission.id, { type: 'phase_changed', phase: p });
          await refresh();
        })
      : setPhase(p);

  const selected = state?.proposals.find((p) => p.id === selectedId) ?? state?.proposals[0];
  const engaged = inLive
    ? new Set(live.assignments.map((a) => a.resourceId)).size
    : status === 'propositions' && selected
      ? engagedCount(selected, phase)
      : undefined;
  const weather = inLive && live.weather ? summarizeWeather(live.weather) : undefined;
  // Créneau et jour/nuit de chaque phase, si la période de l'intervention est connue.
  const slots = mission ? phaseSlots(mission, centreZone(mission)[1], centreZone(mission)[0]) : [];
  const slotLabel = (p: number) => {
    const slot = slots[p];
    return slot
      ? `${formatSlotTime(slot.start)} – ${formatSlotTime(slot.end, slot.start)}, ${slot.day ? 'jour' : 'nuit'}`
      : undefined;
  };

  return (
    <>
      <header className="topbar">
        <button
          className={`identity ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          title={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <span className="tricolore" aria-hidden="true" />
          <span className="identity-text">
            <b>Aeris</b>
            <small>Aide à la décision drones</small>
          </span>
          <svg
            className="identity-chevron"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>

        <div className="topbar-center">
          <nav className="segmented steps" aria-label="Étape">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                className={i === current ? 'active' : ''}
                aria-current={i === current ? 'step' : undefined}
                disabled={i !== current && !canGo(s.id)}
                onClick={() => goTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {mission && mission.phaseCount > 1 && status !== 'config' && (
            <div className="segmented" role="group" aria-label="Phase active">
              {[...Array(mission.phaseCount).keys()].map((p) => (
                <button
                  key={p}
                  className={p === phase ? 'active' : ''}
                  aria-pressed={p === phase}
                  disabled={busy && inLive}
                  title={
                    [inLive ? `Passer l’opération en phase ${p + 1}` : undefined, slotLabel(p)]
                      .filter(Boolean)
                      .join(' : ') || undefined
                  }
                  onClick={() => p !== phase && choosePhase(p)}
                >
                  Phase {p + 1}
                </button>
              ))}
            </div>
          )}

          {mission && (
            <span
              className={`pill ${engaged === undefined ? '' : engaged <= mission.maxDrones ? 'ok' : 'danger'}`}
              title="Nombre maximal de drones fixé par l’arrêté préfectoral"
            >
              Arrêté{' '}
              {engaged === undefined
                ? `${mission.maxDrones} drones max`
                : `${engaged} / ${mission.maxDrones} drones`}
            </span>
          )}
        </div>

        <div className="topbar-right">
          {weather ? (
            <span className={`weather ${weather.caveat ? 'caveat' : ''}`} title={weather.caveat}>
              <b>Vent {weather.wind}</b>
              <small>
                {weather.conditions}
                {weather.caveat && `, ${weather.caveat.toLowerCase()}`}
              </small>
            </span>
          ) : (
            <small className="weather" title="La météo est relevée au lancement de l’opération">
              Météo relevée en conduite
            </small>
          )}

          <div className="segmented" role="group" aria-label="Fond de carte">
            {BASEMAPS.map((b) => (
              <button
                key={b.id}
                className={b.id === basemap ? 'active' : ''}
                aria-pressed={b.id === basemap}
                onClick={() => setBasemap(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <AppMenu />
    </>
  );
}
