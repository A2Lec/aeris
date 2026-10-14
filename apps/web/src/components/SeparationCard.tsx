import type { Assignment } from '@aeris/shared';
import { separationCascade, type StepStatus } from './separation';
import './components.css';

const STATUS: Record<StepStatus, { label: string; tone: string }> = {
  appliquee: { label: 'Appliquée', tone: 'info' },
  inutile: { label: 'Non nécessaire', tone: '' },
  impossible: { label: 'Impossible', tone: 'danger' },
};

/**
 * Séparation de l'espace aérien : les 4 niveaux de la cascade du brief, dans l'ordre où le
 * module les essaie, puis l'explication de tout renoncement, conflit ou limite rencontrée.
 */
export function SeparationCard({
  assignments,
  diagnostics,
  infeasible,
}: {
  assignments: Assignment[];
  /** Diagnostics de la phase (sans préfixe). */
  diagnostics: string[];
  infeasible?: boolean;
}) {
  const { steps, explanations } = separationCascade(assignments, diagnostics);
  const danger = explanations.filter((e) => e.severity === 'danger');
  const warn = explanations.filter((e) => e.severity === 'warn');
  return (
    <section className="card separation" aria-labelledby="separation-title">
      <h3 id="separation-title">Séparation de l’espace aérien</h3>
      <ol>
        {steps.map((s) => {
          const tone =
            s.id === 'renoncement' && s.status === 'appliquee' ? 'danger' : STATUS[s.status].tone;
          return (
            <li key={s.id} className={s.status}>
              <div>
                <b>{s.label}</b>
                <small>{s.detail}</small>
              </div>
              <span className={`pill ${tone}`}>
                {s.id === 'renoncement' && s.status === 'appliquee'
                  ? 'Appliqué'
                  : STATUS[s.status].label}
              </span>
            </li>
          );
        })}
      </ol>
      {infeasible && (
        <div className="notice danger">
          Le solveur ne trouve aucun dispositif qui respecte toutes les contraintes.
        </div>
      )}
      {danger.length > 0 && (
        <div className="notice danger">
          <b>Pourquoi des moyens sont retirés</b>
          <ul>
            {danger.map((e, i) => (
              <li key={i}>{e.text}</li>
            ))}
          </ul>
        </div>
      )}
      {warn.length > 0 && (
        <div className="notice warn">
          <b>Points de vigilance</b>
          <ul>
            {warn.map((e, i) => (
              <li key={i}>{e.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
