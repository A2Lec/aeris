import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useMissionStore } from '../app/missionStore';
import { useLiveStore } from '../features/live/store';
import { useScenarioStore } from '../features/scenarios/store';
import { useThemeStore, type Theme } from '../theme';
import { projectFileName, toProject } from './project';
import { useStartStore } from './Welcome';
import './components.css';

/** Ouverture du menu latéral, déclenchée par le bloc logo + nom du bandeau. */
export const useMenuStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Télécharge le projet en cours (mission, propositions, dispositif retenu). */
function saveProject() {
  const state = useMissionStore.getState().state;
  if (!state) return;
  const project = toProject(state);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(project);
  link.click();
  URL.revokeObjectURL(url);
}

/** Ferme le projet en cours et revient au choix Planification / Conduite. */
function backToStart() {
  useMissionStore.setState({ state: undefined, error: undefined });
  useLiveStore.setState({ live: undefined, view: 'current', zoneLevel: undefined });
  useScenarioStore.setState({
    selectedId: undefined,
    phase: 0,
    draft: undefined,
    minimized: false,
  });
  useStartStore.getState().setMode(undefined);
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
];

/**
 * Menu latéral de l'application (réglages). Chaque rubrique est une <section> :
 * en ajouter une suffit pour les réglages à venir.
 */
export function AppMenu() {
  const { open, setOpen } = useMenuStore();
  const { theme, setTheme } = useThemeStore();
  const hasMission = useMissionStore((st) => !!st.state);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    // Phase de capture : Échap ferme le menu avant de réduire les fenêtres de l'étape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      <div className="menu-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <nav
        id="app-menu"
        ref={panel}
        className="app-menu"
        aria-label="Menu de l’application"
        tabIndex={-1}
      >
        <section aria-labelledby="menu-project">
          <h3 id="menu-project">Projet</h3>
          <div className="menu-actions">
            <button disabled={!hasMission} onClick={saveProject}>
              Enregistrer le projet
            </button>
            <button
              onClick={() => {
                if (
                  hasMission &&
                  !window.confirm(
                    'Fermer le projet en cours ? Enregistrez-le d’abord pour le reprendre.',
                  )
                )
                  return;
                backToStart();
                setOpen(false);
              }}
            >
              Revenir à l’accueil
            </button>
          </div>
          {!hasMission && <p className="hint">Aucun projet ouvert.</p>}
        </section>

        <section aria-labelledby="menu-display">
          <h3 id="menu-display">Affichage</h3>
          <div className="menu-row">
            <span>Thème</span>
            <div className="segmented" role="group" aria-label="Thème">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={theme === t.id ? 'active' : ''}
                  aria-pressed={theme === t.id}
                  onClick={() => setTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </nav>
    </>
  );
}
