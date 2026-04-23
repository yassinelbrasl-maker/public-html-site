import { GenericPlaceholder } from "./GenericPlaceholder";

export const ProjetsSection = () => (
  <GenericPlaceholder
    title="Projets"
    icon="🏗️"
    description="Liste des projets internes en cours, avec leur état, leur équipe, les lots et les phases."
    endpoints={[
      "/cortoba-plateforme/api/projects_admin.php",
      "/cortoba-plateforme/api/chantier.php",
      "/cortoba-plateforme/api/chantier_reunions.php",
    ]}
  />
);

export const SuiviSection = () => (
  <GenericPlaceholder
    title="Suivi"
    icon="📊"
    description="Tableau de suivi des missions par projet — affectations, avancement, phases, livrables."
    endpoints={[
      "/cortoba-plateforme/api/projects_admin.php",
      "/cortoba-plateforme/api/livrables.php",
    ]}
  />
);

export const RendementSection = () => (
  <GenericPlaceholder
    title="Rendement"
    icon="📈"
    description="Analyse de rendement par collaborateur. Graphiques donut + line (remplacer Chart.js du legacy par recharts)."
    endpoints={[
      "/cortoba-plateforme/api/rendement.php",
      "/cortoba-plateforme/api/users.php",
    ]}
  />
);

