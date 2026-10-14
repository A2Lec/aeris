import type { ReactNode } from 'react';
import './wizard.css';

interface WizardWindowProps {
  /** Intitulé de chaque fenêtre du parcours, dans l'ordre. */
  steps: readonly string[];
  current: number;
  /** Fenêtres accessibles d'un clic sur la barre de progression. */
  canOpen: (step: number) => boolean;
  onOpen: (step: number) => void;
  /** Texte d'aide sous le titre : ce qu'il faut faire dans cette fenêtre. */
  intro?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  /** Fenêtre centrée sur une carte assombrie (rien à dessiner) ; sinon posée à gauche. */
  centered?: boolean;
}

/**
 * Fenêtre d'un parcours pas à pas, posée sur la carte. La barre de progression montre
 * où l'on en est et permet de revenir à une fenêtre déjà remplie.
 */
export function WizardWindow({
  steps,
  current,
  canOpen,
  onOpen,
  intro,
  children,
  footer,
  centered,
}: WizardWindowProps) {
  return (
    <div className={`wizard-layer ${centered ? 'centered' : ''}`}>
      <section
        className="wizard"
        role="dialog"
        aria-modal={centered ? true : undefined}
        aria-labelledby="wizard-title"
        key={current}
      >
        <header className="wizard-head">
          <ol className="wizard-progress" aria-label="Étapes">
            {steps.map((label, i) => (
              <li key={label}>
                <button
                  className={i === current ? 'current' : i < current ? 'done' : ''}
                  aria-current={i === current ? 'step' : undefined}
                  disabled={i === current || !canOpen(i)}
                  onClick={() => onOpen(i)}
                  title={label}
                >
                  <span className="sr-only">{label}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="wizard-count">
            Étape {current + 1} sur {steps.length}
          </p>
          <h2 id="wizard-title">{steps[current]}</h2>
          {intro && <p className="wizard-intro">{intro}</p>}
        </header>
        <div className="wizard-body">{children}</div>
        <footer className="wizard-foot">{footer}</footer>
      </section>
    </div>
  );
}
