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
      // TODO — port à venir (voir MIGRATION.md) :
      // { path: "plateforme/*", element: lazyRoute(<PlateformeShell />) }, // admin app
    ],
  },
]);
