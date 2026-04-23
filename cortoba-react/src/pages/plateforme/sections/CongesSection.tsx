import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Conge {
  id: number | string;
  user_id?: string;
  user_name?: string;
  date_debut?: string;
  date_fin?: string;
  type?: string; // conges, maladie, absence, etc.
  status?: string; // approuve, en_attente, refuse
  jours?: number;
  motif?: string;
}

/**
 * /plateforme/conges — Journal des absences et congés.
 * Consomme /cortoba-plateforme/api/conges.php
 */
export function CongesSection() {
  const [items, setItems] = useState<Conge[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/conges.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">🌴</span>
          <h1 className="font-serif text-3xl font-light text-fg">Congés</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {items.length}
            </span>
          )}
        </div>
        <button type="button" className="cta-button cta-button-primary text-xs">
          ＋ Déclarer une absence
        </button>
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
          Aucune absence enregistrée.
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/5 bg-bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[0.62rem] tracking-[0.18em] uppercase text-fg-muted">
                <Th>Membre</Th>
                <Th>Type</Th>
                <Th>Période</Th>
                <Th>Jours</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {items.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.02 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="border-b border-white/5"
                  >
                    <Td className="font-medium text-fg">{c.user_name || "—"}</Td>
                    <Td className="text-fg-muted capitalize">{c.type || "—"}</Td>
                    <Td className="text-fg-muted text-xs">
                      {fmtDate(c.date_debut)} → {fmtDate(c.date_fin)}
                    </Td>
                    <Td className="tabular-nums">{c.jours || "—"}</Td>
                    <Td>
                      <CongeStatusPill status={c.status} />
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

function CongeStatusPill({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  let color = "bg-fg-muted/10 text-fg-muted border-white/10";
  let label = status || "—";
  if (s.includes("approuv") || s.includes("valid")) {
    color = "bg-green-500/10 text-green-400 border-green-500/30";
    label = "Approuvé";
  } else if (s.includes("refus")) {
    color = "bg-red-500/10 text-red-400 border-red-500/30";
    label = "Refusé";
  } else if (s.includes("attent")) {
    color = "bg-gold/10 text-gold border-gold-dim/30";
    label = "En attente";
  }
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full border text-[0.62rem] tracking-wider ${color}`}
    >
      {label}
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
    });
  } catch {
    return d;
  }
}
