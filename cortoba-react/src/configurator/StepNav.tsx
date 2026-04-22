import { useConfigurator } from "./context";
import { StepKey, STEP_ORDER } from "./state";

interface Props {
  nextLabel?: string;
  onNext?: () => boolean | void;
}

/**
 * Boutons de navigation Retour / Suivant. Reusable dans chaque step.
 * onNext peut retourner `false` pour bloquer la progression (validation custom).
 */
export function StepNav({ nextLabel = "Étape suivante →", onNext }: Props) {
  const { step, goTo } = useConfigurator();
  const currentIdx = STEP_ORDER.indexOf(step);
  const prev: StepKey | null = currentIdx > 0 ? STEP_ORDER[currentIdx - 1] : null;
  const next: StepKey | null =
    currentIdx < STEP_ORDER.length - 1 ? STEP_ORDER[currentIdx + 1] : null;

  function handleNext() {
    if (onNext) {
      const r = onNext();
      if (r === false) return;
    }
    if (next) goTo(next);
  }

  return (
    <div className="mt-10 flex items-center gap-4 pt-8 border-t border-white/5">
      {prev && (
        <button
          type="button"
          onClick={() => goTo(prev)}
          className="cta-button"
        >
          ← Retour
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={handleNext}
          className="cta-button cta-button-primary ml-auto"
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
