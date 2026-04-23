import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface ProjetAdmin {
  id: number | string;
  code?: string;
  title?: string;
  client?: string;
  status?: string;
  phase?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  progress?: number;
}

/**
 * /plateforme/projets — Liste interne des projets (admin view, ≠ published_projects).
 * Consomme /cortoba-plateforme/api/projects_admin.php (ou fallback sur
 * /api/dashboard.php / /api/journal.php selon config serveur).
 */
export function ProjetsSection() {
  const [items, setItems] = useState<ProjetAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    // Try projects_admin first, fallback to dashboard
    apiFetch("/cortoba-plateforme/api/projects_admin.php")
      .then(async (r) => {
        if (r.ok) return r.json();
        // fallback
        const r2 = await apiFetch("/cortoba-plateforme/api/dashboard.php");
        return r2.json();
      })
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : data.data || data.projects || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const statuses = useMemo(() => {
    if (!items) return [];
    const set = new Set<string>();
    items.forEach((p) => p.status && set.add(p.status));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "all") return items;
    return items.filter((p) => p.status === filter);
  }, [items, filter]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏗️</span>
          <h1 className="font-serif text-3xl font-light text-fg">Projets</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {items.length}
            </span>
          )}
        </div>
        <button type="button" className="cta-button cta-button-primary text-xs">
          ＋ Nouveau projet
        </button>
      </motion.div>

      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-6 border-b border-white/5">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
            Tous
          </FilterTab>
          {statuses.map((s) => (
            <FilterTab
              key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
            >
              {s}
            </FilterTab>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {!error && filtered === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {!error && filtered !== null && filtered.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucun projet.
        </div>
      )}

      {!error && filtered !== null && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence>
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.03 }}
                whileHover={{ y: -3 }}
                className="bg-bg-card border border-white/5 rounded-md p-5 hover:border-gold-dim transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {p.code && (
                      <div className="text-[0.6rem] tracking-[0.2em] uppercase text-gold mb-1">
                        {p.code}
                      </div>
                    )}
                    <div className="font-serif text-lg text-fg truncate">
                      {p.title || "Sans titre"}
                    </div>
                    {p.client && (
                      <div className="text-xs text-fg-muted mt-0.5 truncate">
                        {p.client}
                      </div>
                    )}
                  </div>
                  {p.status && (
                    <span className="shrink-0 text-[0.62rem] px-2 py-1 rounded-full border border-white/10 text-fg-muted tracking-wider uppercase">
                      {p.status}
                    </span>
                  )}
                </div>

                {p.phase && (
                  <div className="text-xs text-fg-muted mb-3">
                    Phase actuelle : <span className="text-fg">{p.phase}</span>
                  </div>
                )}

                {typeof p.progress === "number" && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[0.62rem] tracking-wider uppercase text-fg-muted mb-1">
                      <span>Avancement</span>
                      <span className="tabular-nums">{p.progress}%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${p.progress}%` }}
                        transition={{ duration: 0.9, delay: 0.15 }}
                        className="h-full bg-gold"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-xs text-fg-muted">
                  <span>{fmtDate(p.start_date)}</span>
                  <span>{fmtDate(p.end_date)}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs tracking-wider uppercase transition-colors ${
        active
          ? "text-gold border-b-2 border-gold -mb-px"
          : "text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}
