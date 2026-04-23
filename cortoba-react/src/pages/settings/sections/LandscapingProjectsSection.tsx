import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface LsProject {
  id: number | string;
  title: string;
  slug?: string;
  tag?: string;
  location?: string;
  hero_image?: string;
  created_at?: string;
}

/**
 * Settings → Projets paysagers (Landscaping).
 * Consomme /cortoba-plateforme/api/landscaping_projects.php
 */
export function LandscapingProjectsSection() {
  const [items, setItems] = useState<LsProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/landscaping_projects.php")
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
          <span className="text-3xl">🌿</span>
          <h1 className="font-serif text-3xl font-light text-fg">Projets paysagers</h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-[#8dba78]/15 text-[#8dba78] text-xs tracking-wider">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          className="cta-button cta-button-primary text-xs"
        >
          ＋ Nouveau projet paysager
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
        <div className="p-16 text-center bg-bg-card border border-dashed border-white/10 rounded-md">
          <div className="text-4xl mb-3 opacity-40">🌿</div>
          <p className="text-sm text-fg-muted">
            Aucun projet paysager publié.
          </p>
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {items.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                className="bg-bg-card border border-white/5 rounded-md overflow-hidden"
              >
                {p.hero_image && (
                  <div
                    className="aspect-[16/10] bg-cover bg-center"
                    style={{ backgroundImage: `url('${p.hero_image}')` }}
                  />
                )}
                <div className="p-4">
                  {p.tag && (
                    <p className="text-[0.62rem] tracking-[0.2em] text-[#8dba78] uppercase mb-1">
                      {p.tag}
                    </p>
                  )}
                  <h3 className="font-serif text-lg text-fg">{p.title}</h3>
                  {p.location && (
                    <p className="text-xs text-fg-muted mt-1">{p.location}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <TodoNote
        items={[
          "Modale d'édition (titre, slug, tag, location, gallery upload)",
          "Upload images vers NAS via WebDAV",
          "Drag-to-reorder (Reorder.Group)",
          "Confirmation de suppression",
        ]}
      />
    </div>
  );
}

function TodoNote({ items }: { items: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="mt-8 p-4 bg-[#8dba78]/5 border border-[#8dba78]/30 rounded-md text-xs text-fg-muted leading-relaxed"
    >
      <strong className="text-[#8dba78] not-italic">TODO restant</strong>{" "}
      —{" "}
      {items.join(" · ")}
    </motion.div>
  );
}
