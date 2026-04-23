import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import { apiFetch } from "@/auth/AuthContext";
import { exportAsCsv } from "@/utils/csv";

interface Depense {
  id: number | string;
  label?: string;
  category?: string;
  amount?: number;
  currency?: string;
  date?: string;
  status?: string;
  project_id?: string;
  project_name?: string;
}

/**
 * /plateforme/depenses — Journal des dépenses.
 * Consomme /cortoba-plateforme/api/depenses.php
 */
export function DepensesSection() {
  const [items, setItems] = useState<Depense[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/depenses.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const totals = useMemo(() => {
    if (!items) return { total: 0, byCategory: {} as Record<string, number> };
    const total = items.reduce((a, d) => a + (d.amount || 0), 0);
    const byCategory: Record<string, number> = {};
    for (const d of items) {
      const cat = d.category || "Autre";
      byCategory[cat] = (byCategory[cat] || 0) + (d.amount || 0);
    }
    return { total, byCategory };
  }, [items]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">💸</span>
          <h1 className="font-serif text-3xl font-light text-fg">Dépenses</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {items.length} entrée{items.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {items && items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const filename = `cortoba-depenses-${new Date()
                  .toISOString()
                  .split("T")[0]}.csv`;
                exportAsCsv(
                  filename,
                  items.map((d) => ({
                    date: d.date || "",
                    label: d.label || "",
                    categorie: d.category || "",
                    projet: d.project_name || d.project_id || "",
                    amount: d.amount ?? "",
                    currency: d.currency || "DT",
                    status: d.status || "",
                  }))
                );
              }}
              className="cta-button text-xs"
              title="Télécharger les dépenses en CSV"
            >
              📥 Exporter CSV
            </button>
          )}
          <button type="button" className="cta-button cta-button-primary text-xs">
            ＋ Nouvelle dépense
          </button>
        </div>
      </motion.div>

      {/* Stats cards + donut chart */}
      {items && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total" value={fmtDT(totals.total)} highlight />
            {Object.entries(totals.byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([cat, sum]) => (
                <StatCard
                  key={cat}
                  label={cat}
                  value={fmtDT(sum)}
                  hint={`${((sum / totals.total) * 100).toFixed(0)}%`}
                />
              ))}
          </div>
          <div className="bg-bg-card border border-white/5 rounded-md p-4">
            <p className="text-[0.62rem] tracking-[0.2em] uppercase text-fg-muted mb-2">
              Répartition par catégorie
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={Object.entries(totals.byCategory).map(([name, value]) => ({
                    name,
                    value,
                  }))}
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {Object.entries(totals.byCategory).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#181818",
                    border: "1px solid rgba(200,169,110,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => fmtDT(Number(value))}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: "#8c8a84" }}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

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
          Aucune dépense enregistrée.
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/5 bg-bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[0.62rem] tracking-[0.18em] uppercase text-fg-muted">
                <Th>Date</Th>
                <Th>Dépense</Th>
                <Th>Projet</Th>
                <Th>Catégorie</Th>
                <Th className="text-right">Montant</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {items.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.015 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="border-b border-white/5"
                  >
                    <Td className="text-fg-muted whitespace-nowrap">{fmtDate(d.date)}</Td>
                    <Td className="text-fg">{d.label || "—"}</Td>
                    <Td className="text-fg-muted">
                      {d.project_name || d.project_id || "—"}
                    </Td>
                    <Td>
                      <span className="text-[0.62rem] px-2 py-0.5 rounded-full border border-white/10 text-fg-muted tracking-wider uppercase">
                        {d.category || "—"}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums font-medium text-fg">
                      {d.amount != null
                        ? fmtDT(d.amount, d.currency)
                        : "—"}
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

const CHART_COLORS = [
  "#c8a96e", // gold
  "#8dba78", // landscape green
  "#0a77a1", // blue
  "#8a7649", // dim gold
  "#c68bb1", // pink
  "#e8a463", // orange
  "#6ecbc5", // teal
  "#b890f5", // purple
];

function StatCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-5 rounded-md border ${
        highlight
          ? "bg-gold/5 border-gold-dim/40"
          : "bg-bg-card border-white/5"
      }`}
    >
      <p className="text-[0.62rem] tracking-[0.2em] uppercase text-fg-muted">
        {label}
      </p>
      <p
        className={`font-serif text-2xl mt-1 tabular-nums ${
          highlight ? "text-gold" : "text-fg"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-fg-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-left font-semibold ${className || ""}`}>{children}</th>;
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

function fmtDT(n: number, currency?: string): string {
  const c = currency || "DT";
  return `${n.toLocaleString("fr-TN")} ${c}`;
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
