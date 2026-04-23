import { useLocation } from "react-router-dom";
import { ProjectDetailPage } from "./ProjectDetailPage";
import { NotFoundPage } from "./NotFoundPage";

/**
 * CatchAll handler.
 *
 * React Router v6 ne supporte PAS les patterns avec préfixe statique dans un
 * même segment (ex. `projet-:slug`). On utilise donc ce composant générique
 * qui lit location.pathname et route manuellement.
 */
export function CatchAllPage() {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, "");

  if (path.startsWith("/projet-")) {
    // ProjectDetailPage lit le slug via useParams mais on n'en a pas ici.
    // On pousse le slug via un prop ou on laisse le composant lire location.
    return <ProjectDetailPage />;
  }

  return <NotFoundPage />;
}
