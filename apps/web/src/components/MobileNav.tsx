import { create } from 'zustand';

export type MobilePane = 'map' | 'left' | 'right';

/** Onglet affiché en conduite sur mobile ; une action qui se fait sur la carte y ramène. */
export const useMobilePaneStore = create<{
  pane: MobilePane;
  setPane: (pane: MobilePane) => void;
}>((set) => ({ pane: 'map', setPane: (pane) => set({ pane }) }));

const TABS: { id: MobilePane; label: string; icon: string }[] = [
  { id: 'map', label: 'Carte', icon: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14' },
  {
    id: 'left',
    label: 'Couples et terrain',
    icon: 'M4 6h16 M4 12h16 M4 18h10',
  },
  {
    id: 'right',
    label: 'Dispositif',
    icon: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  },
];

/**
 * Barre d'onglets du bas, en conduite sur mobile : la carte, le panneau de travail
 * (couples, événements, journal) et le panneau de décision (indicateurs, recalcul).
 * Masquée sur grand écran, où les trois sont côte à côte.
 */
export function MobileNav({
  pending,
}: {
  /** Un recalcul attend une décision : pastille sur l'onglet Dispositif. */
  pending?: boolean;
}) {
  const { pane, setPane } = useMobilePaneStore();
  return (
    <nav className="mobile-nav" aria-label="Affichage">
      {TABS.map((t) => (
        <button
          key={t.id}
          aria-current={pane === t.id ? 'page' : undefined}
          onClick={() => setPane(t.id)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d={t.icon}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t.label}
          {t.id === 'right' && pending && (
            <>
              <span className="badge" aria-hidden="true" />
              <span className="sr-only"> (recalcul proposé en attente)</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}
