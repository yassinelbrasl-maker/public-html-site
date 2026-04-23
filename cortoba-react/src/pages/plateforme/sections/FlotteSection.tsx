import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Vehicule {
  id: number | string;
  marque?: string;
  modele?: string;
  immatriculation?: string;
  annee?: number | string;
  etat?: string;
  assurance_expire?: string;
  prochain_entretien?: string;
  kilometrage?: number;
}

/**
 * /plateforme/flotte — Gestion du parc automobile.
 * Consomme /cortoba-plateforme/api/flotte.php
 */
export function FlotteSection() {
  const [items, setItems] = useState<Vehicule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/flotte.php")
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
          <span className="text-3xl">🚗</span>
          <h1 className="font-serif text-3xl font-light text-fg">Flotte</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {items.length} véhicule{items.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button type="button" className="cta-button cta-button-primary text-xs">
          ＋ Ajouter un véhicule
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
          Aucun véhicule enregistré.
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {items.map((v, i) => (
              <motion.div
                key={v.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                className="bg-bg-card border border-white/5 rounded-md p-5 hover:border-gold-dim transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-serif text-lg text-fg">
                      {v.marque || "—"} {v.modele || ""}
                    </div>
                    {v.annee && (
                      <div className="text-xs text-fg-muted">{v.annee}</div>
                    )}
                  </div>
                  {v.immatriculation && (
                    <span className="text-[0.62rem] px-2 py-1 rounded-md bg-gold/10 border border-gold-dim/30 text-gold tabular-nums">
                      {v.immatriculation}
                    </span>
                  )}
                </div>

                <dl className="space-y-1.5 text-xs">
                  {v.kilometrage != null && (
                    <Row label="Kilométrage">
                      {v.kilometrage.toLocaleString("fr-FR")} km
                    </Row>
                  )}
                  {v.assurance_expire && (
                    <Row label="Assurance">
                      <Expiry date={v.assurance_expire} />
                    </Row>
                  )}
                  {v.prochain_entretien && (
                    <Row label="Prochain entretien">
                      <Expiry date={v.prochain_entretien} />
                    </Row>
                  )}
                  {v.etat && (
                    <Row label="État">
                      <span className="text-fg">{v.etat}</span>
                    </Row>
                  )}
                </dl>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-fg-muted uppercase tracking-wider text-[0.62rem]">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Expiry({ date }: { date: string }) {
  try {
    const d = new Date(date);
    const now = new Date();
    const days = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const color =
      days < 0
        ? "text-red-400"
        : days < 30
        ? "text-gold"
        : "text-fg";
    return (
      <span className={color}>
        {d.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
        {days < 0 && <span className="ml-1 text-red-400">(expirée)</span>}
        {days >= 0 && days < 30 && (
          <span className="ml-1 text-gold">({days}j)</span>
        )}
      </span>
    );
  } catch {
    return <span>{date}</span>;
  }
}
