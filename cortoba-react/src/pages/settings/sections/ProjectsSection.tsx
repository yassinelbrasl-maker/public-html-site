import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { fetchPublishedProjects, type Project } from "@/api/projects";
import { apiFetch } from "@/auth/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { ProjectEditorModal } from "./ProjectEditorModal";

/**
 * Settings → Projets publiés.
 * Liste + création + édition + suppression + drag-to-reorder.
 */
export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    fetchPublishedProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  };

  useEffect(() => { load(); }, []);

  async function handleDelete(slug: string) {
    const ok = await confirm({
      message: (
        <>
          Supprimer définitivement le projet{" "}
          <strong className="text-fg">{slug}</strong> ?
        </>
      ),
      tone: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setDeleting(slug);
    try {
      const res = await apiFetch(
        `/cortoba-plateforme/api/published_projects.php?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Suppression échouée");
      setProjects((prev) => prev?.filter((p) => p.slug !== slug) || null);
      toast.success("Projet supprimé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function saveOrder(newOrder: Project[]) {
    setProjects(newOrder);
    try {
      const slugs = newOrder.map((p) => p.slug);
      const res = await apiFetch(
        "/cortoba-plateforme/api/published_projects.php?action=reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slugs }),
        }
      );
      if (!res.ok) {
        // Fallback: PUT each with its new sort_order
        await Promise.all(
          newOrder.map((p, i) =>
            apiFetch("/cortoba-plateforme/api/published_projects.php", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug: p.slug, sort_order: i }),
            })
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">📸</span>
          <h1 className="font-serif text-3xl font-light text-fg">Projets publiés</h1>
          {projects && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {projects.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="cta-button cta-button-primary text-xs"
        >
          ＋ Nouveau projet
        </button>
      </motion.div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="text-fg-muted hover:text-fg">
            ×
          </button>
        </div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xs text-fg-muted mb-4 flex items-center gap-2"
      >
        <span>⋮⋮</span>
        Glissez les vignettes pour réorganiser. ✎ pour éditer · 🗑 pour supprimer.
      </motion.p>

      {projects === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {projects !== null && projects.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted bg-bg-card border border-dashed border-white/10 rounded-md">
          Aucun projet publié.{" "}
          <button
            onClick={() => setCreating(true)}
            className="text-gold hover:underline"
          >
            Créer le premier
          </button>
          .
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <Reorder.Group
          as="div"
          axis="y"
          values={projects}
          onReorder={saveOrder}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {projects.map((p) => (
              <Reorder.Item
                as="div"
                key={p.slug}
                value={p}
                whileDrag={{
                  scale: 1.03,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                  zIndex: 10,
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-bg-card border border-white/5 rounded-md overflow-hidden group cursor-grab active:cursor-grabbing"
              >
                <div className="relative">
                  <div
                    className="aspect-[16/10] bg-cover bg-center pointer-events-none"
                    style={{ backgroundImage: `url('${p.hero_image}')` }}
                  />
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                      className="w-8 h-8 rounded-md bg-gold/90 text-bg hover:bg-gold text-xs"
                      title="Éditer"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.slug);
                      }}
                      disabled={deleting === p.slug}
                      className="w-8 h-8 rounded-md bg-red-500/90 text-white hover:bg-red-500 text-xs disabled:opacity-50"
                      title="Supprimer"
                    >
                      {deleting === p.slug ? "…" : "🗑"}
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[0.62rem] tracking-[0.2em] text-gold uppercase mb-1">
                    {p.category}
                  </p>
                  <h3 className="font-serif text-lg text-fg">{p.title}</h3>
                  <p className="text-xs text-fg-muted mt-1">
                    {p.location}
                    {p.country && `, ${p.country}`}
                  </p>
                  <span className="inline-block mt-3 text-[0.6rem] text-fg-muted tracking-wider uppercase">
                    /projet-{p.slug}
                  </span>
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      <ProjectEditorModal
        open={creating || editing !== null}
        project={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
