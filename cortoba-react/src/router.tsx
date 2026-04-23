import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import { RootLayout } from "./layouts/RootLayout";
import { HomePage } from "./pages/HomePage";
import { LandscapingPage } from "./pages/LandscapingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Code-split : le configurateur (≈ 200KB avec Leaflet) et la page détail projet
// ne sont téléchargés que quand l'utilisateur y accède.
const ProjectDetailPage = lazy(() =>
  import("./pages/ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage }))
);
const ConfiguratorPage = lazy(() =>
  import("./pages/ConfiguratorPage").then((m) => ({ default: m.ConfiguratorPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const PlateformeShell = lazy(() =>
  import("./pages/plateforme/PlateformeShell").then((m) => ({
    default: m.PlateformeShell,
  }))
);
const PlateformeIndex = lazy(() =>
  import("./pages/plateforme/PlateformeShell").then((m) => ({
    default: m.PlateformeIndex,
  }))
);
const DemandesSection = lazy(() =>
  import("./pages/plateforme/sections/DemandesSection").then((m) => ({
    default: m.DemandesSection,
  }))
);
const PlateformeProjets = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.ProjetsSection,
  }))
);
const PlateformeSuivi = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.SuiviSection,
  }))
);
const PlateformeRendement = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.RendementSection,
  }))
);
const PlateformeLivrables = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.LivrablesSection,
  }))
);
const PlateformeDepenses = lazy(() =>
  import("./pages/plateforme/sections/DepensesSection").then((m) => ({
    default: m.DepensesSection,
  }))
);
const PlateformeEquipe = lazy(() =>
  import("./pages/plateforme/sections/EquipeSection").then((m) => ({
    default: m.EquipeSection,
  }))
);
const PlateformeLivrablesReal = lazy(() =>
  import("./pages/plateforme/sections/LivrablesSection").then((m) => ({
    default: m.LivrablesSection,
  }))
);
const PlateformeConges = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.CongesSection,
  }))
);
const PlateformeFiscal = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.FiscalSection,
  }))
);
const PlateformeFlotte = lazy(() =>
  import("./pages/plateforme/sections/Placeholders").then((m) => ({
    default: m.FlotteSection,
  }))
);

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-fg-muted text-sm">Chargement…</div>
    </div>
  );
}

function lazyRoute(el: React.ReactElement) {
  return <Suspense fallback={<PageLoader />}>{el}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "landscaping", element: <LandscapingPage /> },
      { path: "projet-:slug", element: lazyRoute(<ProjectDetailPage />) },
      { path: "configurateur", element: lazyRoute(<ConfiguratorPage />) },
      { path: "settings", element: lazyRoute(<SettingsPage />) },
      {
        path: "plateforme",
        element: lazyRoute(<PlateformeShell />),
        children: [
          { index: true, element: lazyRoute(<PlateformeIndex />) },
          { path: "demandes", element: lazyRoute(<DemandesSection />) },
          { path: "projets", element: lazyRoute(<PlateformeProjets />) },
          { path: "suivi", element: lazyRoute(<PlateformeSuivi />) },
          { path: "rendement", element: lazyRoute(<PlateformeRendement />) },
          { path: "livrables", element: lazyRoute(<PlateformeLivrablesReal />) },
          { path: "depenses", element: lazyRoute(<PlateformeDepenses />) },
          { path: "equipe", element: lazyRoute(<PlateformeEquipe />) },
          { path: "conges", element: lazyRoute(<PlateformeConges />) },
          { path: "fiscal", element: lazyRoute(<PlateformeFiscal />) },
          { path: "flotte", element: lazyRoute(<PlateformeFlotte />) },
        ],
      },
    ],
  },
]);
