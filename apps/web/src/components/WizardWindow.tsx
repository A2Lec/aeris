import { useEffect, useState, type ReactNode } from 'react';
import { useConfigEditorStore } from '../features/config/store';
import { useIsMobile } from './useMobile';
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
 * Sur mobile, elle devient un panneau en bas d'écran, repliable, qui se replie de lui-même
 * pendant un tracé pour laisser la carte au doigt.
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
  const mobile = useIsMobile();
  const { drawMode, editing, setDrawMode, setEditing } = useConfigEditorStore();
  const onMap = drawMode !== 'idle' || editing;
  const [folded, setFolded] = useState(false);

  // Tracé ou retouche en cours : la carte passe au premier plan, puis la fenêtre revient.
  useEffect(() => setFolded(onMap), [onMap]);
  useEffect(() => setFolded(false), [current]);

  const collapsed = mobile && !centered && folded;

  return (
    <div className={`wizard-layer ${centered ? 'centered' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <section
        className="wizard"
        role="dialog"
        aria-modal={centered ? true : undefined}
        aria-labelledby="wizard-title"
        key={current}
      >
        {mobile && !centered && (
          <button
            className="wizard-handle"
            onClick={() => setFolded(!folded)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Déplier la fenêtre' : 'Replier la fenêtre pour voir la carte'}
          >
            <span aria-hidden="true" />
          </button>
        )}
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
        {collapsed && onMap && (
          <div className="wizard-peek" role="status">
            <p>
              {editing
                ? 'Faites glisser les sommets sur la carte pour retoucher les tracés.'
                : 'Touchez la carte pour placer les sommets, puis le premier sommet pour fermer la zone.'}
            </p>
            <button
              className="small"
              onClick={() => (editing ? setEditing(false) : setDrawMode('idle'))}
            >
              {editing ? 'Terminer' : 'Annuler'}
            </button>
          </div>
        )}
        <div className="wizard-body">{children}</div>
        <footer className="wizard-foot">{footer}</footer>
      </section>
    </div>
  );
}
