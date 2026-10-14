import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useThemeStore, type Theme } from '../theme';
import './components.css';

/** Ouverture du menu latéral, déclenchée par le bloc logo + nom du bandeau. */
export const useMenuStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

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
