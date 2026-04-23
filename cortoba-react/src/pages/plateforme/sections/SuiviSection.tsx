import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Tache {
  id: number | string;
  title?: string;
  project_id?: string;
  project_name?: string;
  user_id?: string;
  user_name?: string;
  phase?: string;
  status?: string;
  due_date?: string;
  progress?: number;
}

/**
 * /plateforme/suivi — Tableau de suivi par tâche/mission.
 * Consomme /cortoba-plateforme/api/journal.php ou /api/chantier.php selon la
 * config serveur. On accepte les deux formes.
 */
export function SuiviSection() {
  const [items, setItems] = useState<Tache[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/journal.php")
      .then(async (r) => {
        if (r.ok) return r.json();
        const r2 = await apiFetch("/cortoba-plateforme/api/chantier.php");
        return r2.json();
      })
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : data.data || data.tasks || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Group by project
  const groupsByProject: Record<string, Tache[]> = {};
  if (items) {
    for (const t of items) {
      const key = t.project_name || t.project_id || "—";
      if (!groupsByProject[key]) groupsByProject[key] = [];
      groupsByProject[key].push(t);
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">📊</span>
          <h1 className="font-serif text-3xl font-light text-fg">Suivi</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {items.length} tâche{items.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {!error && items === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {!error && items !== null && items.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucune tâche de suivi.
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <div className="space-y-6">
          <AnimatePresence>
            {Object.entries(groupsByProject).map(([project, tasks], gi) => (
              <motion.div
                key={project}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: gi * 0.05 }}
                className="bg-bg-card border border-white/5 rounded-md overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gold">{project}</h3>
                    <span className="text-xs text-fg-muted">
                      {tasks.length} tâche{tasks.length > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {tasks.map((t, i) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.02 }}
                      className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-fg truncate">
                          {t.title || "—"}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-fg-muted">
                          {t.user_name && <span>👤 {t.user_name}</span>}
                          {t.phase && <span>📋 {t.phase}</span>}
                          {t.due_date && <span>📅 {fmtDate(t.due_date)}</span>}
                        </div>
                      </div>
                      {typeof t.progress === "number" && (
                        <div className="w-24 shrink-0">
                          <div className="text-[0.62rem] text-fg-muted text-right tabular-nums">
                            {t.progress}%
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${t.progress}%` }}
                              transition={{ duration: 0.7, delay: 0.2 }}
                              className="h-full bg-gold"
                            />
                          </div>
                        </div>
                      )}
                      {t.status && !("progress" in t && typeof t.progress === "number") && (
                        <span className="text-[0.62rem] px-2 py-0.5 rounded-full border border-white/10 text-fg-muted tracking-wider uppercase shrink-0">
                          {t.status}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return d;
  }
}
