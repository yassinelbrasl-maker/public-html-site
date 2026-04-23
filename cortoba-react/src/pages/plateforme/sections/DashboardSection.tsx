import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/auth/AuthContext";

interface Demande {
  id: number | string;
  nom_projet?: string;
  prenom?: string;
  nom?: string;
  created_at?: string;
  cout_estime_low?: number;
  cout_estime_high?: number;
  status?: string;
}

interface DashboardData {
  demandes: Demande[] | null;
  projectsCount: number | null;
  depensesTotal: number | null;
  livrablesEnRetard: number | null;
}

/**
 * /plateforme (index) — Vue d'ensemble.
 *
 * KPI cards + sparkline des demandes (30j/90j) + dernières demandes + raccourcis.
 * Consomme plusieurs API en parallèle. Tout tombe en fallback proprement
 * si un endpoint ne répond pas.
 */
export function DashboardSection() {
  const [data, setData] = useState<DashboardData>({
    demandes: null,
    projectsCount: null,
    depensesTotal: null,
    livrablesEnRetard: null,
  });
  const [range, setRange] = useState<30 | 90>(30);

  useEffect(() => {
    // Fetch in parallel, silently ignoring errors per endpoint
    Promise.all([
      apiFetch("/cortoba-plateforme/api/demandes_admin.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch("/cortoba-plateforme/api/published_projects.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch("/cortoba-plateforme/api/depenses.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch("/cortoba-plateforme/api/livrables.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([demandesRes, projectsRes, depensesRes, livrablesRes]) => {
      const demandes = arrayFrom<Demande>(demandesRes);
      const projects = arrayFrom<unknown>(projectsRes);
      const depenses = arrayFrom<{ amount?: number }>(depensesRes);
      const livrables = arrayFrom<{ status?: string; due_date?: string }>(
        livrablesRes
      );

      setData({
        demandes,
        projectsCount: projects.length,
        depensesTotal: depenses.reduce((a, d) => a + (d.amount || 0), 0),
        livrablesEnRetard: livrables.filter(
          (l) =>
            /retard/i.test(l.status || "") ||
            (l.due_date && new Date(l.due_date) < new Date())
        ).length,
      });
    });
  }, []);

  const demandsByDay = useMemo(() => {
    if (!data.demandes) return [];
    // Last N days count (30 or 90 per range toggle)
    const now = new Date();
    const counts: Record<string, number> = {};
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const key = d.toISOString().split("T")[0];
      counts[key] = 0;
    }
    for (const d of data.demandes) {
      if (!d.created_at) continue;
      const key = d.created_at.split("T")[0];
      if (key in counts) counts[key]++;
    }
    return Object.entries(counts).map(([date, count]) => ({
      date,
      count,
      label: new Date(date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      }),
    }));
  }, [data.demandes, range]);

  const recent = useMemo(() => {
    if (!data.demandes) return [];
    return data.demandes.slice(0, 5);
  }, [data.demandes]);

  const demandesThisMonth = useMemo(() => {
    if (!data.demandes) return 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return data.demandes.filter(
      (d) => d.created_at && new Date(d.created_at) >= monthStart
    ).length;
  }, [data.demandes]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-serif text-3xl font-light text-fg">
          Vue d'ensemble
        </h1>
        <p className="text-xs text-fg-muted tracking-wider uppercase mt-1">
          Activité récente de la plateforme
        </p>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi
          label="Demandes"
          value={data.demandes?.length ?? "…"}
          hint={`${demandesThisMonth} ce mois-ci`}
          icon="📥"
          link="/plateforme/demandes"
          delay={0}
        />
        <Kpi
          label="Projets publiés"
          value={data.projectsCount ?? "…"}
          icon="📸"
          link="/plateforme/projets"
          delay={0.05}
        />
        <Kpi
          label="Dépenses totales"
          value={
            data.depensesTotal != null
              ? new Intl.NumberFormat("fr-TN").format(data.depensesTotal) + " DT"
              : "…"
          }
          icon="💸"
          link="/plateforme/depenses"
          delay={0.1}
        />
        <Kpi
          label="Livrables en retard"
          value={data.livrablesEnRetard ?? "…"}
          icon="⚠"
          tone={
            data.livrablesEnRetard && data.livrablesEnRetard > 0
              ? "warning"
              : "default"
          }
          link="/plateforme/livrables"
          delay={0.15}
        />
      </div>

      {/* Demands trend chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-card border border-white/5 rounded-md p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <h2 className="text-xs tracking-[0.2em] uppercase text-gold font-semibold">
            Demandes reçues ({range} derniers jours)
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-0.5 bg-bg-elev border border-white/10 rounded-md">
              {[30, 90].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r as 30 | 90)}
                  className={`px-2.5 py-1 rounded text-[0.65rem] tracking-wider uppercase transition-colors ${
                    range === r
                      ? "bg-gold/15 text-gold"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {r}j
                </button>
              ))}
            </div>
            <Link
              to="/plateforme/demandes"
              className="text-xs text-fg-muted hover:text-gold tracking-wider uppercase"
            >
              Voir toutes →
            </Link>
          </div>
        </div>
        {data.demandes === null ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-fg-muted">
            Chargement…
          </div>
        ) : demandsByDay.every((d) => d.count === 0) ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-fg-muted">
            Aucune demande sur les 30 derniers jours.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart
              data={demandsByDay}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                stroke="#8c8a84"
                fontSize={10}
                interval={4}
              />
              <YAxis
                stroke="#8c8a84"
                fontSize={10}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#181818",
                  border: "1px solid rgba(200,169,110,0.3)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => `Le ${v}`}
                formatter={(v) => [Number(v), "Demande(s)"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#c8a96e"
                strokeWidth={2}
                dot={{ r: 2, fill: "#c8a96e" }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Recent demands list */}
      {recent.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-bg-card border border-white/5 rounded-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h2 className="text-xs tracking-[0.2em] uppercase text-gold font-semibold">
              Dernières demandes
            </h2>
            <Link
              to="/plateforme/demandes"
              className="text-xs text-fg-muted hover:text-gold tracking-wider uppercase"
            >
              Toutes →
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {recent.map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-fg truncate">
                    {d.nom_projet || "Sans nom"}
                  </div>
                  <div className="text-xs text-fg-muted truncate">
                    {[d.prenom, d.nom].filter(Boolean).join(" ") || "—"}
                    {d.created_at && ` · ${fmtRelativeDate(d.created_at)}`}
                  </div>
                </div>
                {d.cout_estime_low && d.cout_estime_high && (
                  <div className="text-xs text-gold tabular-nums text-right shrink-0">
                    {fmtK(d.cout_estime_low)} – {fmtK(d.cout_estime_high)}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "default",
  link,
  delay = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: string;
  tone?: "default" | "warning";
  link?: string;
  delay?: number;
}) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={link ? { y: -2 } : undefined}
      className={`p-5 rounded-md border cursor-pointer transition-colors ${
        tone === "warning"
          ? "bg-red-500/5 border-red-500/30"
          : "bg-bg-card border-white/5 hover:border-gold-dim"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl">{icon}</span>
      </div>
      <p
        className={`font-serif text-3xl tabular-nums ${
          tone === "warning" ? "text-red-400" : "text-fg"
        }`}
      >
        {value}
      </p>
      <p className="text-[0.62rem] tracking-[0.2em] uppercase text-fg-muted mt-1">
        {label}
      </p>
      {hint && <p className="text-xs text-fg-muted mt-0.5">{hint}</p>}
    </motion.div>
  );
  return link ? <Link to={link}>{card}</Link> : card;
}

function arrayFrom<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && "data" in raw) {
    const d = (raw as { data?: T[] }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

function fmtK(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(".0", "") + "M€";
  return (n / 1000).toFixed(0) + "k€";
}

function fmtRelativeDate(d: string): string {
  try {
    const then = new Date(d);
    const now = new Date();
    const ms = now.getTime() - then.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days}j`;
    if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
    return then.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch {
    return d;
  }
}
