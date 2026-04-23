import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Capture les erreurs JavaScript non-rattrapées dans l'arbre React et affiche
 * un fallback lisible au lieu d'une page blanche.
 *
 * Ne remplace PAS l'errorElement de React Router (qui gère les erreurs de
 * loader/action) — c'est une dernière ligne de défense pour les render errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log pour le dev — en prod, pourrait être envoyé à Sentry ou équivalent
    // eslint-disable-next-line no-console
    console.error("[Cortoba] uncaught render error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultErrorScreen error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorScreen({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-fg px-6">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-6 opacity-70">⚠</div>
        <h1 className="font-serif text-3xl font-light mb-3">
          Oups — quelque chose a mal tourné
        </h1>
        <p className="text-sm text-fg-muted mb-6 leading-relaxed">
          Une erreur inattendue s'est produite. Vous pouvez recharger la page
          ou retourner à l'accueil.
        </p>
        <details className="mb-6 text-left text-xs text-fg-muted/80 bg-bg-card border border-white/5 rounded-md p-3">
          <summary className="cursor-pointer">Détails techniques</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[0.7rem]">
            {error.message}
          </pre>
        </details>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              onReset();
              window.location.reload();
            }}
            className="cta-button cta-button-primary text-xs"
          >
            ↻ Recharger
          </button>
          <a href="/" className="cta-button text-xs">
            ← Accueil
          </a>
        </div>
      </div>
    </div>
  );
}
