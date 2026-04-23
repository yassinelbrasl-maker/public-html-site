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

export const LivrablesSection = () => (
  <GenericPlaceholder
    title="Livrables"
    icon="📄"
    description="Gestion des livrables par projet : types, statut, échéances, validation client."
    endpoints={["/cortoba-plateforme/api/livrables.php"]}
  />
);

export const DepensesSection = () => (
  <GenericPlaceholder
    title="Dépenses"
    icon="💸"
    description="Journal des dépenses avec catégorisation, templates récurrents, graphiques de répartition."
    endpoints={[
      "/cortoba-plateforme/api/depenses.php",
      "/cortoba-plateforme/api/depenses_templates.php",
    ]}
  />
);

export const EquipeSection = () => (
  <GenericPlaceholder
    title="Équipe"
    icon="👥"
    description="Gestion des membres de l'équipe : rôles, modules accessibles, photo de profil, statut."
    endpoints={["/cortoba-plateforme/api/users.php"]}
  />
);

export const CongesSection = () => (
  <GenericPlaceholder
    title="Congés"
    icon="🌴"
    description="Calendrier des absences et des congés, demandes et validations."
    endpoints={["/cortoba-plateforme/api/conges.php"]}
  />
);

export const FiscalSection = () => (
  <GenericPlaceholder
    title="Fiscal"
    icon="🏛️"
    description="Calendrier fiscal tunisien, échéances déclaratives, rappels automatiques."
    endpoints={["/cortoba-plateforme/api/echeancier.php"]}
  />
);

export const FlotteSection = () => (
  <GenericPlaceholder
    title="Flotte"
    icon="🚗"
    description="Gestion du parc automobile : véhicules, assurances, entretiens, journal de bord."
    endpoints={["/cortoba-plateforme/api/flotte.php"]}
  />
);
