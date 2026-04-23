import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/auth/AuthContext";
import { fetchPublicTeam, fullName, type TeamMember } from "@/api/users";

interface Demande {
  id: number | string;
  nom_projet?: string;
  prenom?: string;
  nom?: string;
}

interface ProjectLite {
  slug?: string;
  title?: string;
}

interface Command {
  id: string;
  type: "nav" | "demande" | "project" | "team";
  label: string;
  hint?: string;
  path: string;
  icon?: string;
  searchable: string; // normalized for matching
}

const NAV_COMMANDS: Command[] = [
  {
    id: "nav-dashboard",
    type: "nav",
    label: "Vue d'ensemble",
    hint: "Dashboard",
    path: "/plateforme",
    icon: "🏠",
    searchable: "vue ensemble dashboard accueil",
  },
  { id: "nav-demandes", type: "nav", label: "Demandes", path: "/plateforme/demandes", icon: "📥", searchable: "demandes leads" },
  { id: "nav-projets", type: "nav", label: "Projets", path: "/plateforme/projets", icon: "🏗️", searchable: "projets projects" },
  { id: "nav-suivi", type: "nav", label: "Suivi", path: "/plateforme/suivi", icon: "📊", searchable: "suivi tracking" },
  { id: "nav-rendement", type: "nav", label: "Rendement", path: "/plateforme/rendement", icon: "📈", searchable: "rendement performance" },
  { id: "nav-livrables", type: "nav", label: "Livrables", path: "/plateforme/livrables", icon: "📄", searchable: "livrables" },
  { id: "nav-depenses", type: "nav", label: "Dépenses", path: "/plateforme/depenses", icon: "💸", searchable: "depenses expenses" },
  { id: "nav-equipe", type: "nav", label: "Équipe", path: "/plateforme/equipe", icon: "👥", searchable: "equipe team" },
  { id: "nav-conges", type: "nav", label: "Congés", path: "/plateforme/conges", icon: "🌴", searchable: "conges holidays" },
  { id: "nav-fiscal", type: "nav", label: "Fiscal", path: "/plateforme/fiscal", icon: "🏛️", searchable: "fiscal" },
  { id: "nav-flotte", type: "nav", label: "Flotte", path: "/plateforme/flotte", icon: "🚗", searchable: "flotte fleet" },
  { id: "nav-settings", type: "nav", label: "Paramètres du site", path: "/settings", icon: "⚙️", searchable: "parametres settings" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Autofocus input + fetch data once when opened
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    setQuery("");
    setCursor(0);
    if (demandes.length === 0 && projects.length === 0 && team.length === 0) {
      Promise.all([
        apiFetch("/cortoba-plateforme/api/demandes_admin.php")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        apiFetch("/cortoba-plateforme/api/published_projects.php")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchPublicTeam().catch(() => []),
      ]).then(([d, p, t]) => {
        setDemandes(Array.isArray(d) ? d : d?.data || []);
        setProjects(Array.isArray(p) ? p : p?.data || []);
        setTeam(Array.isArray(t) ? t : []);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allCommands: Command[] = useMemo(() => {
    return [
      ...NAV_COMMANDS,
      ...demandes.slice(0, 20).map((d) => ({
        id: `demande-${d.id}`,
        type: "demande" as const,
        label: d.nom_projet || "Projet sans nom",
        hint: [d.prenom, d.nom].filter(Boolean).join(" ") || "",
        path: "/plateforme/demandes",
        icon: "📥",
        searchable: normalize(
          [d.nom_projet, d.prenom, d.nom].filter(Boolean).join(" ")
        ),
      })),
      ...projects.slice(0, 20).map((p) => ({
        id: `project-${p.slug}`,
        type: "project" as const,
        label: p.title || "Projet",
        hint: `/projet-${p.slug}`,
        path: `/projet-${p.slug}`,
        icon: "🏗️",
        searchable: normalize(`${p.title || ""} ${p.slug || ""}`),
      })),
      ...team.slice(0, 20).map((m) => ({
        id: `team-${m.id}`,
        type: "team" as const,
        label: fullName(m),
        hint: m.role || m.spec || "",
        path: "/plateforme/equipe",
        icon: "👤",
        searchable: normalize(
          `${fullName(m)} ${m.role || ""} ${m.spec || ""}`
        ),
      })),
    ];
  }, [demandes, projects, team]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return allCommands.slice(0, 20);
    return allCommands
      .filter((c) => c.searchable.includes(q))
      .slice(0, 20);
  }, [query, allCommands]);

  // Reset cursor on query change
  useEffect(() => {
    setCursor(0);
  }, [query]);

  function runCommand(c: Command) {
    navigate(c.path);
    setOpen(false);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[cursor]) runCommand(results[cursor]);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[400] flex items-start justify-center pt-24 px-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative w-full max-w-xl bg-bg-elev border border-white/10 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <span className="text-fg-muted">🔍</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Recherche : demande, projet, membre, section…"
                className="flex-1 bg-transparent text-fg placeholder:text-fg-muted focus:outline-none"
              />
              <kbd className="text-[0.6rem] text-fg-muted border border-white/10 rounded px-1.5 py-0.5">
                esc
              </kbd>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {results.length === 0 && (
                <div className="p-6 text-center text-sm text-fg-muted">
                  Aucun résultat
                </div>
              )}
              {results.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => runCommand(c)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    cursor === i
                      ? "bg-gold/10 text-gold"
                      : "text-fg hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="text-base shrink-0">{c.icon || "·"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.label}</div>
                    {c.hint && (
                      <div className="text-xs text-fg-muted truncate">
                        {c.hint}
                      </div>
                    )}
                  </div>
                  <span className="text-[0.6rem] uppercase tracking-wider text-fg-muted shrink-0">
                    {c.type === "nav"
                      ? "Section"
                      : c.type === "demande"
                      ? "Lead"
                      : c.type === "project"
                      ? "Projet"
                      : "Membre"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/5 text-[0.6rem] text-fg-muted">
              <div className="flex gap-3">
                <span>
                  <kbd className="border border-white/10 rounded px-1">↑↓</kbd>{" "}
                  naviguer
                </span>
                <span>
                  <kbd className="border border-white/10 rounded px-1">↵</kbd>{" "}
                  ouvrir
                </span>
              </div>
              <div>
                <kbd className="border border-white/10 rounded px-1">⌘K</kbd>{" "}
                /{" "}
                <kbd className="border border-white/10 rounded px-1">Ctrl+K</kbd>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
