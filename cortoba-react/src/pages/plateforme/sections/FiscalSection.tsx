import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Echeance {
  id: number | string;
  label?: string;
  type?: string; // tva, is, rs, etc.
  due_date?: string;
  periode?: string;
  status?: string;
  amount?: number;
}

/**
 * /plateforme/fiscal — Calendrier fiscal tunisien.
 * Consomme /cortoba-plateforme/api/echeancier.php
 */
export function FiscalSection() {
  const [items, setItems] = useState<Echeance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/echeancier.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const groups = useMemo(() => {
    if (!items) return { upcoming: [], past: [], overdue: [] };
    const now = new Date();
    const upcoming: Echeance[] = [];
    const past: Echeance[] = [];
    const overdue: Echeance[] = [];
    for (const e of items) {
      if (!e.due_date) {
        past.push(e);
        continue;
      }
      const d = new Date(e.due_date);
      const isDone =
        e.status && /(declar|payé|valid|complet)/i.test(e.status);
      if (isDone) past.push(e);
      else if (d < now) overdue.push(e);
      else upcoming.push(e);
    }
    upcoming.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    return { upcoming, overdue, past };
  }, [items]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏛️</span>
          <h1 className="font-serif text-3xl font-light text-fg">
            Calendrier fiscal
          </h1>
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

      {!error && items !== null && (
        <div className="space-y-8">
          {groups.overdue.length > 0 && (
            <Group
              title="🚨 En retard"
              tone="danger"
              items={groups.overdue}
              emptyLabel=""
            />
          )}
          <Group
            title="⏳ À venir"
            tone="primary"
            items={groups.upcoming}
            emptyLabel="Aucune échéance à venir."
          />
          <Group
            title="✓ Passées"
            tone="muted"
            items={groups.past}
            emptyLabel="Aucune échéance passée."
          />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  emptyLabel,
}: {
  title: string;
  tone: "primary" | "danger" | "muted";
  items: Echeance[];
  emptyLabel: string;
}) {
  const color =
    tone === "danger"
      ? "border-red-500/30"
      : tone === "muted"
      ? "border-white/5 opacity-70"
      : "border-gold-dim/30";

  return (
    <div>
      <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted font-semibold mb-3">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted italic">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {items.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className={`flex items-center justify-between gap-4 p-4 rounded-md bg-bg-card border ${color}`}
              >
                <div>
                  <div className="text-sm text-fg font-medium">
                    {e.label || e.type || "Échéance"}
                  </div>
                  {e.periode && (
                    <div className="text-xs text-fg-muted mt-0.5">
                      {e.periode}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-fg tabular-nums">
                    {fmtDate(e.due_date)}
                  </div>
                  {e.amount != null && (
                    <div className="text-xs text-gold tabular-nums mt-0.5">
                      {e.amount.toLocaleString("fr-TN")} DT
                    </div>
                  )}
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
      year: "numeric",
    });
  } catch {
    return d;
  }
}
