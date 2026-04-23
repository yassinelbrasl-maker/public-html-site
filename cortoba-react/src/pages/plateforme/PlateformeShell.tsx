import { Outlet, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { LoginScreen } from "../settings/LoginScreen";
import { Seo } from "@/seo/Seo";
import { CommandPalette } from "./CommandPalette";
import clsx from "clsx";

/**
 * /plateforme/* — Console admin principale.
 *
 * Port de plateforme-nas.html :
 *  - Login partagé avec /settings (même auth.php)
 *  - Sidebar avec 10 sections majeures
 *  - Routes imbriquées via React Router
 *  - Chaque section = sa propre route enfant (code-split possible plus tard)
 */

export function PlateformeShell() {
  return (
    <AuthProvider>
      <Seo title="Plateforme" noIndex />
      <PlateformeInner />
    </AuthProvider>
  );
}

function PlateformeInner() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="text-fg-muted text-sm"
        >
          Chargement de la plateforme…
        </motion.div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return <PlateformeLayout />;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const SIDEBAR: SidebarItem[] = [
  { id: "dashboard", label: "Vue d'ensemble", icon: "🏠", path: "/plateforme" },
  { id: "projets", label: "Projets", icon: "🏗️", path: "/plateforme/projets" },
  { id: "demandes", label: "Demandes", icon: "📥", path: "/plateforme/demandes" },
  { id: "suivi", label: "Suivi", icon: "📊", path: "/plateforme/suivi" },
  { id: "rendement", label: "Rendement", icon: "📈", path: "/plateforme/rendement" },
  { id: "livrables", label: "Livrables", icon: "📄", path: "/plateforme/livrables" },
  { id: "depenses", label: "Dépenses", icon: "💸", path: "/plateforme/depenses" },
  { id: "equipe", label: "Équipe", icon: "👥", path: "/plateforme/equipe" },
  { id: "conges", label: "Congés", icon: "🌴", path: "/plateforme/conges" },
  { id: "fiscal", label: "Fiscal", icon: "🏛️", path: "/plateforme/fiscal" },
  { id: "flotte", label: "Flotte", icon: "🚗", path: "/plateforme/flotte" },
];

function PlateformeLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-bg-card border-r border-white/5 py-6 flex flex-col shrink-0">
        <div className="px-6 pb-6 flex items-center gap-3 border-b border-white/5">
          <img
            src="/img/Copilot_20250803_202525.png"
            alt="Cortoba"
            className="h-8"
          />
          <span className="text-xs tracking-[0.15em] uppercase text-gold font-semibold">
            Plateforme
          </span>
        </div>

        {/* Search hint (triggers Cmd+K) */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => {
              // Dispatch Cmd+K programmatically
              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "k",
                  metaKey: true,
                  ctrlKey: true,
                })
              );
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 hover:border-gold-dim text-xs text-fg-muted hover:text-fg transition-colors text-left"
          >
            <span>🔍</span>
            <span className="flex-1">Rechercher…</span>
            <kbd className="text-[0.55rem] border border-white/10 rounded px-1">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {SIDEBAR.map((item) => {
            // Exact match for /plateforme (index), startsWith for children
            const active =
              item.path === "/plateforme"
                ? location.pathname === "/plateforme" ||
                  location.pathname === "/plateforme/"
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.id}
                to={item.path}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-gold/10 text-gold"
                    : "text-fg-muted hover:text-fg hover:bg-white/[0.03]"
                )}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/5 text-xs text-fg-muted">
          <div className="mb-2 truncate" title={user?.email}>
            {user?.name || user?.email}
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full px-3 py-2 rounded-md border border-white/10 hover:border-red-500/50 hover:text-red-400 transition-colors text-left"
          >
            ↩ Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="p-10"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <CommandPalette />
    </div>
  );
}

// Le dashboard de /plateforme est maintenant défini dans
// sections/DashboardSection.tsx — ce n'est plus une redirection.
