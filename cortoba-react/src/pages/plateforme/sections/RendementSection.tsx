import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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

          {/* Per-member bars */}
          <div className="bg-bg-card border border-white/5 rounded-md p-6">
            <h2 className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-5">
              Performance par membre
            </h2>
            <div className="space-y-4">
              {enriched
                .slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((e, i) => {
                  const name = e.member
                    ? fullName(e.member)
                    : e.user_name || e.user_id;
                  const score = e.score || 0;
                  return (
                    <motion.div
                      key={e.user_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.05 }}
                    >
                      <div className="flex items-center justify-between mb-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          {e.member?.profile_picture_url ? (
                            <img
                              src={e.member.profile_picture_url}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : e.member ? (
                            <div className="w-6 h-6 rounded-full bg-bg border border-gold-dim text-gold text-[0.62rem] flex items-center justify-center">
                              {initialsFor(e.member)}
                            </div>
                          ) : null}
                          <span className="text-fg">{name}</span>
                          {e.tasks_done != null && e.tasks_total != null && (
                            <span className="text-xs text-fg-muted">
                              ({e.tasks_done}/{e.tasks_total})
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gold tabular-nums font-semibold">
                          {score}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(score / maxScore) * 100}%` }}
                          transition={{
                            duration: 0.9,
                            delay: 0.1 + i * 0.05,
                            ease: [0.22, 0.61, 0.36, 1],
                          }}
                          className="h-full bg-gradient-to-r from-gold-dim to-gold"
                        />
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="p-4 bg-gold/5 border border-gold-dim/30 rounded-md text-xs text-fg-muted leading-relaxed"
          >
            <strong className="text-gold not-italic">TODO</strong> — Ajouter des
            graphiques temporels (évolution sur 30j / 90j) avec{" "}
            <code>recharts</code>, filtres par période et par projet, export
            CSV/PDF.
          </motion.div>
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
