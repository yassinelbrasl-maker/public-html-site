import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./layouts/RootLayout";
import { HomePage } from "./pages/HomePage";
import { LandscapingPage } from "./pages/LandscapingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "landscaping", element: <LandscapingPage /> },
      // TODO — ports à venir (voir MIGRATION.md) :
      // { path: "configurateur", lazy: () => import("./pages/ConfiguratorPage") },
      // { path: "projet-:slug", lazy: () => import("./pages/ProjectDetailPage") },
      // { path: "settings", lazy: () => import("./pages/SettingsPage") }, // admin public content
      // { path: "plateforme/*", lazy: () => import("./pages/PlateformeShell") }, // admin app
    ],
  },
]);
