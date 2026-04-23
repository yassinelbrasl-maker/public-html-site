/**
 * Placeholders restants pour les steps 2, 5, 6 — à terminer.
 * Steps 3 et 4 sont maintenant portés dans leurs propres fichiers
 * (Step3Fondations.tsx, Step4Identite.tsx).
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
        ]}
      />
      <StepNav />
    </>
  );
}

export function Step5Programme() {
  return (
    <>
      <StepPlaceholder
        num="05"
        title="Programme"
        description="Niveaux, chambres, salles de bain, cuisine, équipements."
        todoItems={[
          "Compteurs numériques (niveaux, chambres, salles de bain) — réutiliser NumericStepper de Step3",
          "Sélecteur type de cuisine",
          "Toggles : salon, garage, piscine, jardin",
          "Si cfg_type === 'mixte' : gestion dynamique cfg_mixte_niveaux[] (add/remove niveaux + usages)",
          "cfgUpdateProgramme() pour recalculer la surface estimée",
        ]}
      />
      <StepNav />
    </>
  );
}

export function Step6Terrain() {
  return (
    <>
      <StepPlaceholder
        num="06"
        title="Terrain"
        description="Localisation de votre terrain."
        todoItems={[
          "Intégrer react-leaflet <MapContainer> avec marker draggable",
          "Géolocalisation par adresse (API Nominatim)",
          "Stocker cfg_terrain_lat, cfg_terrain_lng, cfg_terrain_adresse",
          "Bouton « Voir les résultats » → flow vers StepClient",
        ]}
      />
      <StepNav nextLabel="Voir les résultats →" />
    </>
  );
}
