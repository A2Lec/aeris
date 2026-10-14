import { create } from 'zustand';

/**
 * Jetons de couleur partagés par le CSS (variables de styles.css) et par les couches
 * Leaflet, qui ont besoin de valeurs littérales. Une couleur = un sens, dans les deux thèmes.
 */
export const SEMANTIC = {
  /** Valide, conforme, couverture d'un TP1 (1 km). */
  ok: '#16A34A',
  /** Couverture d'un TP2 (2 km), stratégie couverture globale. */
  info: '#2563EB',
  /** Zone prioritaire, stratégie priorité. */
  priority: '#7C3AED',
  /** Chevauchement, recalcul à faire, vigilance. */
  warn: '#D97706',
  /** Zone interdite, trou de couverture, TP indisponible, renoncement. */
  danger: '#DC2626',
  /** Hauteur limitée (terrain militaire). */
  limited: '#EA580C',
  /** Zone de travail / périmètre de l'arrêté. */
  perimeter: '#0284C7',
  neutral: '#64748B',
} as const;

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'aeris-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // stockage indisponible : thème clair par défaut
  }
  return 'light';
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // préférence non mémorisée, sans conséquence
  }
}

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>((set) => {
  const theme = initialTheme();
  apply(theme);
  return {
    theme,
    setTheme: (next) => {
      apply(next);
      set({ theme: next });
    },
  };
});
