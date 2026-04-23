import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/auth/AuthContext";
import { ProjectsSection } from "./sections/ProjectsSection";
import { PlaceholderSection } from "./sections/PlaceholderSection";
import clsx from "clsx";

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  group?: "cortoba" | "landscaping" | "system";
}

const SIDEBAR: SidebarItem[] = [
  { id: "projects", label: "Projets publiés", icon: "📸" },
  { id: "slider", label: "Slider accueil", icon: "🎞️" },
  { id: "ls-projects", label: "Projets paysagers", icon: "🌿", group: "landscaping" },
  { id: "ls-slider", label: "Slider héro", icon: "🖼️", group: "landscaping" },
  { id: "general", label: "Général", icon: "⚙️", group: "system" },
  { id: "seo", label: "SEO & Méta", icon: "📈", group: "system" },
];

export function SettingsShell({
  section,
  onSectionChange,
}: {
  section: string;
  onSectionChange: (s: string) => void;
}) {
  const { user, logout } = useAuth();

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
            Paramètres
          </span>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {SIDEBAR.map((item, i) => {
            const prev = SIDEBAR[i - 1];
            const needDivider = prev && prev.group !== item.group;
            return (
              <div key={item.id}>
                {needDivider && (
                  <div className="my-3 mx-3 border-t border-white/5" />
                )}
                {item.group === "landscaping" && !prev?.group && (
                  <div className="px-4 py-1 mt-3 text-[0.58rem] tracking-[0.18em] uppercase text-[#8dba78]/70 font-semibold">
                    Landscaping
                  </div>
                )}
                <SidebarButton
                  item={item}
                  active={section === item.id}
                  onClick={() => onSectionChange(item.id)}
                />
              </div>
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

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="p-10"
          >
            {section === "projects" && <ProjectsSection />}
            {section === "slider" && (
              <PlaceholderSection
                title="Slider accueil"
                icon="🎞️"
                description="Gestion des slides du carousel de la page d'accueil. Endpoint PHP : /api/slider.php"
              />
            )}
            {section === "ls-projects" && (
              <PlaceholderSection
                title="Projets paysagers"
                icon="🌿"
                description="Gestion des projets de la page Landscaping. Endpoint PHP : /api/landscaping_projects.php"
              />
            )}
            {section === "ls-slider" && (
              <PlaceholderSection
                title="Slider héro — Landscaping"
                icon="🖼️"
                description="Gestion des images du héro de la page Landscaping. Endpoint PHP : /api/landscaping_slider.php"
              />
            )}
            {section === "general" && (
              <PlaceholderSection
                title="Paramètres généraux"
                icon="⚙️"
                description="Infos de contact, WhatsApp, horaires, réseaux sociaux."
              />
            )}
            {section === "seo" && (
              <PlaceholderSection
                title="SEO & Méta"
                icon="📈"
                description="Titre, description, Open Graph, structured data par page."
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function SidebarButton({
  item,
  active,
  onClick,
}: {
  item: SidebarItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm text-left transition-colors",
        active
          ? "bg-gold/10 text-gold"
          : "text-fg-muted hover:text-fg hover:bg-white/[0.03]"
      )}
    >
      <span className="text-base">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}
