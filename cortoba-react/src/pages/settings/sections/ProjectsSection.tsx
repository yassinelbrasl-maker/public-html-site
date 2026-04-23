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
      .then((list) => {
        // Filtre les projets pollués (titre vide) — résidus de saves cassés.
        // L'admin peut les purger en base via phpMyAdmin ; côté UI on les cache
        // pour éviter la confusion.
        const clean = list.filter((p) => p.title && p.title.trim());
        setProjects(clean);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setProjects([]);
      });
  };

  useEffect(() => { load(); }, []);

  async function handleDelete(slug: string) {
    const proj = projects?.find((p) => p.slug === slug);
    if (!proj?.id) {
      toast.error("Projet introuvable (id manquant)");
      return;
    }
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
        `/cortoba-plateforme/api/published_projects.php?id=${proj.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`Suppression échouée (HTTP ${res.status})`);
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
    const ids = newOrder.map((p) => p.id).filter((x): x is number => !!x);
    if (ids.length === 0) return;
    try {
      // POST ?reorder=1 with {order: [id1, id2, ...]} — endpoint léger qui
      // ne touche que sort_order, pas besoin d'envoyer toute la charge utile
      // (description + gallery_images) pour chaque projet.
      const res = await apiFetch(
        "/cortoba-plateforme/api/published_projects.php?reorder=1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: ids }),
        }
      );
      if (!res.ok) {
        throw new Error(`Réorganisation échouée (HTTP ${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load(); // revert à l'ordre serveur si échec
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

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-wrap items-center justify-between gap-4 mb-4"
      >
        <p className="text-xs text-fg-muted flex items-center gap-2">
          <span>⋮⋮</span>
          Glissez les vignettes pour réorganiser. ✎ pour éditer · 🗑 pour supprimer.
        </p>
        <div className="flex items-center gap-1 p-1 bg-bg-card border border-white/10 rounded-md">
          {[
            { id: "desktop" as const, label: "PC", icon: "🖥️", width: "100%" },
            { id: "tablet" as const, label: "Tablette", icon: "📱", width: "768px" },
            { id: "mobile" as const, label: "Mobile", icon: "📲", width: "380px" },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              className={`px-3 py-1.5 rounded text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                device === d.id
                  ? "bg-gold/15 text-gold"
                  : "text-fg-muted hover:text-fg"
              }`}
              title={`Aperçu ${d.label} (${d.width})`}
            >
              <span>{d.icon}</span>
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

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
        <motion.div
          layout
          animate={{
            maxWidth:
              device === "mobile"
                ? "380px"
                : device === "tablet"
                ? "768px"
                : "100%",
          }}
          transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
          className="mx-auto border border-dashed border-white/5 rounded-lg p-2"
        >
        <Reorder.Group
          as="div"
          axis="y"
          values={projects}
          onReorder={saveOrder}
          className={
            device === "mobile"
              ? "grid grid-cols-1 gap-4"
              : device === "tablet"
              ? "grid grid-cols-1 md:grid-cols-2 gap-4"
              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          }
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
        </motion.div>
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
