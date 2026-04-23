import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface Demande {
  id: string | number;
  nom_projet?: string;
  prenom?: string;
  nom?: string;
  tel?: string;
  email?: string;
  source?: string;
  cfg_data?: string;
  missions?: string[] | string;
  surface_estimee?: number;
  cout_estime_low?: number;
  cout_estime_high?: number;
  created_at?: string;
  status?: string;
}

/**
 * /plateforme/demandes — Liste des leads envoyés depuis le configurateur public.
 *
 * Consomme /cortoba-plateforme/api/demandes_admin.php (ou demandes.php suivant
 * la config serveur). Fallback élégant si pas de permissions.
 */
export function DemandesSection() {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Demande | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/demandes_admin.php")
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          throw new Error("Accès non autorisé");
        }
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setDemandes(list);
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
          <span className="text-3xl">📥</span>
          <h1 className="font-serif text-3xl font-light text-fg">Demandes</h1>
          {demandes && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {demandes.length} lead{demandes.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {!error && demandes === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {!error && demandes !== null && demandes.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucune demande reçue pour le moment.
        </div>
      )}

      {!error && demandes !== null && demandes.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/5 bg-bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[0.62rem] tracking-[0.18em] uppercase text-fg-muted">
                <Th>Projet</Th>
                <Th>Client</Th>
                <Th>Contact</Th>
                <Th>Surface</Th>
                <Th>Budget estimé</Th>
                <Th>Date</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {demandes.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.02 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    onClick={() => setSelected(d)}
                    className="border-b border-white/5 cursor-pointer"
                  >
                    <Td>
                      <div className="font-medium text-fg">
                        {d.nom_projet || "—"}
                      </div>
                      {d.source && (
                        <div className="text-[0.6rem] text-fg-muted tracking-wider uppercase">
                          via {d.source}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {[d.prenom, d.nom].filter(Boolean).join(" ") || "—"}
                    </Td>
                    <Td>
                      <div>{d.tel || "—"}</div>
                      {d.email && (
                        <div className="text-xs text-fg-muted truncate">
                          {d.email}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {d.surface_estimee ? `${d.surface_estimee} m²` : "—"}
                    </Td>
                    <Td>
                      {d.cout_estime_low && d.cout_estime_high
                        ? `${fmtK(d.cout_estime_low)} – ${fmtK(d.cout_estime_high)}`
                        : "—"}
                    </Td>
                    <Td className="text-xs text-fg-muted">
                      {fmtDate(d.created_at)}
                    </Td>
                    <Td>
                      <span className="text-gold text-xs">→</span>
                    </Td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <DemandeDetail
            demande={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
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
  return <td className={`px-4 py-3 align-top ${className || ""}`}>{children}</td>;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M€";
  return (n / 1000).toFixed(0) + "k€";
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

function DemandeDetail({
  demande,
  onClose,
}: {
  demande: Demande;
  onClose: () => void;
}) {
  let cfg: Record<string, unknown> | null = null;
  try {
    if (demande.cfg_data && typeof demande.cfg_data === "string") {
      cfg = JSON.parse(demande.cfg_data);
    }
  } catch {
    /* ignore parse errors */
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 z-50"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-bg-elev border-l border-white/5 z-50 overflow-auto"
      >
        <div className="sticky top-0 bg-bg-elev/95 backdrop-blur-sm border-b border-white/5 p-5 flex items-center justify-between">
          <div>
            <p className="text-[0.62rem] tracking-[0.2em] uppercase text-gold">
              Demande
            </p>
            <h3 className="font-serif text-xl text-fg">
              {demande.nom_projet || "Sans nom"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 hover:border-gold hover:text-gold text-fg-muted"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <Row label="Client">
            {[demande.prenom, demande.nom].filter(Boolean).join(" ") || "—"}
          </Row>
          <Row label="Téléphone">{demande.tel || "—"}</Row>
          <Row label="Email">{demande.email || "—"}</Row>
          <Row label="Reçue le">{fmtDate(demande.created_at)}</Row>
          <Row label="Surface estimée">
            {demande.surface_estimee ? `${demande.surface_estimee} m²` : "—"}
          </Row>
          <Row label="Budget estimé">
            {demande.cout_estime_low && demande.cout_estime_high
              ? `${fmtK(demande.cout_estime_low)} – ${fmtK(demande.cout_estime_high)}`
              : "—"}
          </Row>

          {cfg && (
            <details className="mt-6 p-4 rounded-md bg-bg-card border border-white/5">
              <summary className="cursor-pointer text-xs tracking-wider uppercase text-fg-muted">
                Données brutes (cfg_data)
              </summary>
              <pre className="mt-3 text-[0.7rem] text-fg-muted leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(cfg, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </motion.div>
    </>
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
    <div className="flex justify-between gap-4 pb-2 border-b border-white/5">
      <span className="text-fg-muted text-xs uppercase tracking-[0.15em]">
        {label}
      </span>
      <span className="text-fg text-right">{children}</span>
    </div>
  );
}
