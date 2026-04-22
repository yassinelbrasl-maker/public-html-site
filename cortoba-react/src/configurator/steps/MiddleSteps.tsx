/**
 * Steps 2 à 6 — placeholders structurels.
 * Chaque step a son validator dans validation.ts, son routage dans context.tsx,
 * et son UI à terminer ici. Pour le moment elles rendent un squelette avec les
 * tâches à compléter, pour ne pas bloquer la livraison du scaffolding.
 *
 * Une fois migrées, elles remplaceront le legacy `configurateur.html` lignes
 * 1007-1781 (les blocs `.cfg-page#cfg-step-2` à `#cfg-step-6`).
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

export function Step3Fondations() {
  return (
    <>
      <StepPlaceholder
        num="03"
        title="Fondations"
        description="Type de bâtiment, nature de l'opération, terrain et budget."
        todoItems={[
          "Sélecteur type de bâtiment (individuel/collectif/résidentiel/commercial/bureautique/mixte)",
          "Sélecteur nature d'opération (neuf/réaménagement/extension)",
          "Slider budget custom (cfg_budget_custom)",
          "Champ terrain (surface m²) avec checkbox « terrain inconnu »",
          "Sélecteur nature du terrain",
        ]}
      />
      <StepNav />
    </>
  );
}

export function Step4Identite() {
  return (
    <>
      <StepPlaceholder
        num="04"
        title="Identité"
        description="Style architectural et niveau de standing."
        todoItems={[
          "Grille de cartes style (.cfg-scard-v2) — contemporain, méditerranéen, traditionnel, etc.",
          "Sélecteur standing avec tooltips explicatifs",
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
          "Compteurs numériques (niveaux, chambres, salles de bain)",
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
          "Géolocalisation par adresse (utiliser API Nominatim ou Mapbox)",
          "Stocker cfg_terrain_lat, cfg_terrain_lng, cfg_terrain_adresse",
          "Bouton « Voir les résultats » → cfgSubmit flow",
        ]}
      />
      <StepNav nextLabel="Voir les résultats →" />
    </>
  );
}
