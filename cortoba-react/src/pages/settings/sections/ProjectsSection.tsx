import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPublishedProjects, type Project } from "@/api/projects";

/**
 * Settings → Projets publiés.
 * MVP : liste live des projets publiés avec preview, catégorie, lieu.
 *
 * À terminer : CRUD complet (nouveau projet, édition, upload images,
 * réorganisation par drag-and-drop via Reorder.Group, device switcher).
 */
export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    fetchPublishedProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">📸</span>
          <h1 className="font-serif text-3xl font-light text-fg">Projets publiés</h1>
        </div>
        <button
          type="button"
          className="cta-button cta-button-primary text-xs"
          title="À implémenter : nouveau projet"
        >
          ＋ Nouveau projet
        </button>
      </motion.div>

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="flex items-center justify-between gap-4 mb-5 p-3 bg-bg-card border border-white/5 rounded-md text-xs"
      >
        <span className="text-fg-muted flex items-center gap-2">
          <span>⋮⋮</span>
          Glissez pour réorganiser · Survolez pour changer la taille
        </span>
        <div className="flex gap-1">
          {[
            { id: "desktop", label: "PC", icon: "🖥️" },
            { id: "tablet", label: "Tablette", icon: "📱" },
            { id: "mobile", label: "Mobile", icon: "📲" },
          ].map((d) => (
            <button
              key={d.id}
              className="px-3 py-1.5 border border-white/10 rounded-md text-fg-muted hover:text-gold hover:border-gold transition-colors"
              title="Device switcher — à brancher sur l'API device_layout"
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* List */}
      {projects === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {projects !== null && projects.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucun projet publié pour le moment.
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {projects.map((p, i) => (
              <motion.div
                key={p.slug}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                className="bg-bg-card border border-white/5 rounded-md overflow-hidden group cursor-grab active:cursor-grabbing"
              >
                <div
                  className="aspect-[16/10] bg-cover bg-center"
                  style={{ backgroundImage: `url('${p.hero_image}')` }}
                />
                <div className="p-4">
                  <p className="text-[0.62rem] tracking-[0.2em] text-gold uppercase mb-1">
                    {p.category}
                  </p>
                  <h3 className="font-serif text-lg text-fg">{p.title}</h3>
                  <p className="text-xs text-fg-muted mt-1">
                    {p.location}
                    {p.country && `, ${p.country}`}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[0.6rem] text-fg-muted tracking-wider uppercase">
                      Slug : {p.slug}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="w-7 h-7 rounded-md border border-white/10 hover:border-gold hover:text-gold text-xs"
                        title="Éditer"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-md border border-white/10 hover:border-red-500/50 hover:text-red-400 text-xs"
                        title="Supprimer"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* TODO banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-4 bg-gold/5 border border-gold-dim/30 rounded-md text-xs text-fg-muted leading-relaxed"
      >
        <strong className="text-gold not-italic">TODO restant sur cette section</strong> —
        modale d'édition (titre, slug, catégorie, description, gallery upload via
        drag-to-NAS), drag-to-reorder via <code>Reorder.Group</code>, device switcher
        branché sur la grille PC/Tablette/Mobile, confirmation de suppression.
      </motion.div>
    </div>
  );
}
