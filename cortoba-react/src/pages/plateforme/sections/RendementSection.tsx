import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { apiFetch } from "@/auth/AuthContext";
import { fullName, initialsFor, type TeamMember } from "@/api/users";

interface RendementEntry {
  user_id: string;
  user_name?: string;
  tasks_total?: number;
  tasks_done?: number;
  hours_logged?: number;
  projects_active?: number;
  score?: number; // pourcentage 0-100
}

/**
 * /plateforme/rendement — Dashboard de rendement par collaborateur.
 *
 * Version MVP : stats agrégées par membre. Le legacy a des graphiques donut
 * et line via Chart.js. Ici on utilise des barres animées en CSS pour rester
 * léger. Un vrai graphique (recharts ou visx) peut être ajouté plus tard si
 * nécessaire.
 */
export function RendementSection() {
  const [entries, setEntries] = useState<RendementEntry[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/cortoba-plateforme/api/rendement.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch("/cortoba-plateforme/api/users.php")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([rend, users]) => {
      const rlist = Array.isArray(rend) ? rend : rend?.data || [];
      const mlist = Array.isArray(users) ? users : users?.data || [];
      if (!rend && !users) {
        setError("Les endpoints rendement.php / users.php ne sont pas disponibles");
      }
      setEntries(rlist);
      setMembers(mlist);
    });
  }, []);

  const enriched = useMemo(() => {
    if (!entries) return null;
    return entries.map((e) => {
      const m = members.find((mm) => String(mm.id) === String(e.user_id));
      return { ...e, member: m };
    });
  }, [entries, members]);

  const maxScore = useMemo(() => {
    if (!entries || entries.length === 0) return 100;
    return Math.max(100, ...entries.map((e) => e.score || 0));
  }, [entries]);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <span className="text-3xl">📈</span>
        <h1 className="font-serif text-3xl font-light text-fg">Rendement</h1>
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-gold/5 border border-gold-dim/30 text-sm text-fg-muted leading-relaxed mb-6">
          <strong className="text-gold not-italic">Note</strong> — {error}.
          Cette section est prête à consommer les données dès que l'endpoint
          rendement.php renverra le tableau attendu.
        </div>
      )}

      {enriched === null && !error && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {enriched !== null && enriched.length === 0 && !error && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucune donnée de rendement disponible pour la période.
        </div>
      )}

      {enriched !== null && enriched.length > 0 && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Membres actifs"
              value={String(enriched.length)}
            />
            <StatCard
              label="Tâches totales"
              value={String(
                enriched.reduce((a, e) => a + (e.tasks_total || 0), 0)
              )}
            />
            <StatCard
              label="Tâches terminées"
              value={String(
                enriched.reduce((a, e) => a + (e.tasks_done || 0), 0)
              )}
              highlight
            />
            <StatCard
              label="Heures cumulées"
              value={
                enriched.reduce((a, e) => a + (e.hours_logged || 0), 0) + " h"
              }
            />
          </div>

          {/* Performance chart (recharts bar) */}
          <div className="bg-bg-card border border-white/5 rounded-md p-6">
            <h2 className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-5">
              Performance par membre
            </h2>
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, enriched.length * 44)}
            >
              <BarChart
                data={enriched
                  .slice()
                  .sort((a, b) => (b.score || 0) - (a.score || 0))
                  .map((e) => ({
                    name: e.member
                      ? fullName(e.member)
                      : e.user_name || String(e.user_id),
                    score: e.score || 0,
                    done: e.tasks_done || 0,
                    total: e.tasks_total || 0,
                  }))}
                layout="vertical"
                margin={{ top: 4, right: 30, left: 80, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.05)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, maxScore]}
                  stroke="#8c8a84"
                  fontSize={10}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#ece7dd"
                  fontSize={11}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "#181818",
                    border: "1px solid rgba(200,169,110,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(200,169,110,0.05)" }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {enriched.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        i < 3 ? "#c8a96e" : i < 6 ? "#8a7649" : "#8c8a84"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
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
        className={`font-serif text-3xl mt-1 tabular-nums ${
          highlight ? "text-gold" : "text-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
