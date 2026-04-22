import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-6 px-6">
      <h1 className="font-serif text-5xl text-fg">Page introuvable</h1>
      <p className="text-fg-muted">Cette page n'existe pas ou a été déplacée.</p>
      <Link to="/" className="cta-button cta-button-primary">
        Retour à l'accueil
      </Link>
    </div>
  );
}
