/**
 * Placeholder restant pour Step 2 — à terminer.
 * Steps 3, 4, 5, 6 sont maintenant portés dans leurs propres fichiers.
 */
import { StepPlaceholder } from "./_shared";
import { StepNav } from "../StepNav";

export function Step2Missions() {
  return (
    <>
      <StepPlaceholder
        num="02"
        title="Missions"
        description="Sélectionnez les missions que vous souhaitez nous confier."
        todoItems={[
          "Porter cfgRenderMissions() — grille de missions filtrée par cfg_type",
          "Toggle sélection (checkboxes) stocké dans cfg_missions[]",
          "Tooltips par mission (équivalent cfg-tooltip)",
          "Voir fonction cfgRenderMissions() lignes 2616+ du configurateur.html",
        ]}
      />
      <StepNav />
    </>
  );
}
