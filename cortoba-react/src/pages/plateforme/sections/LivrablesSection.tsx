import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Livrable {
  id: number | string;
  title?: string;
  project_id?: string;
  project_name?: string;
  type?: string;
  status?: string;
  due_date?: string;
  created_at?: string;
}

/**
 * /plateforme/livrables — Liste des livrables par projet.
 * Consomme /cortoba-plateforme/api/livrables.php
 */
export function LivrablesSection() {
  const [livrables, setLivrables] = useState<Livrable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "en_cours" | "valide" | "en_retard">("all");

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/livrables.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setLivrables(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!livrables) return null;
    if (filter === "all") return livrables;
    return livrables.filter((l) => (l.status || "").toLowerCase().includes(filter));
  }, [livrables, filter]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">📄</span>
          <h1 className="font-serif text-3xl font-light text-fg">Livrables</h1>
          {livrables && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {livrables.length}
            </span>
          )}
        </div>
        <button type="button" className="cta-button cta-button-primary text-xs">
          ＋ Nouveau livrable
        </button>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-white/5">
        {[
          { id: "all", label: "Tous" },
          { id: "en_cours", label: "En cours" },
          { id: "valide", label: "Validés" },
          { id: "en_retard", label: "En retard" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id as typeof filter)}
            className={`px-4 py-2 text-xs tracking-wider uppercase transition-colors ${
              filter === f.id
                ? "text-gold border-b-2 border-gold -mb-px"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

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
          Aucun livrable {filter !== "all" && "pour ce filtre"}.
        </div>
      )}

      {!error && filtered !== null && filtered.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/5 bg-bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[0.62rem] tracking-[0.18em] uppercase text-fg-muted">
                <Th>Livrable</Th>
                <Th>Projet</Th>
                <Th>Type</Th>
                <Th>Échéance</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.02 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="border-b border-white/5 cursor-pointer"
                  >
                    <Td className="font-medium text-fg">{l.title || "—"}</Td>
                    <Td className="text-fg-muted">{l.project_name || l.project_id || "—"}</Td>
                    <Td className="text-fg-muted">{l.type || "—"}</Td>
                    <Td>{fmtDate(l.due_date)}</Td>
                    <Td>
                      <StatusPill status={l.status} />
                    </Td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  let color = "bg-fg-muted/10 text-fg-muted border-white/10";
  if (s.includes("valid")) color = "bg-green-500/10 text-green-400 border-green-500/30";
  else if (s.includes("retard")) color = "bg-red-500/10 text-red-400 border-red-500/30";
  else if (s.includes("cours"))
    color = "bg-gold/10 text-gold border-gold-dim/30";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full border text-[0.62rem] tracking-wider ${color}`}
    >
      {status || "—"}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}
function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className || ""}`}>{children}</td>;
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
