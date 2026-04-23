import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { fetchPublishedProjects, parseHeroPosition, type Project } from "@/api/projects";
import { apiFetch } from "@/auth/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { ProjectEditorModal } from "./ProjectEditorModal";

/**
 * Settings → Projets publiés.
 * Grille 2D drag-to-reorder via @dnd-kit/sortable.
 *
 * La disposition admin est **strictement identique** à celle du site public
 * (`components/ProjectsSection.tsx`) : même grille 3 colonnes, mêmes row-spans
 * selon `grid_class` (big / wide / tall / full / ""), même aspect ratio.
 * L'aperçu == le rendu final, modulo l'overlay boutons éditer/supprimer.
 */

// Doit matcher components/ProjectCard.tsx à la lettre.
const GRID_CLASS_MAP: Record<string, string> = {
  big: "md:col-span-2 md:row-span-2",
  wide: "md:col-span-2",
  tall: "md:row-span-2",
  full: "md:col-span-3",
  "": "",
};

export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [activeDrag, setActiveDrag] = useState<Project | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // évite les clics accidentels
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const load = () => {
    fetchPublishedProjects()
      .then((list) => {
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
      load();
    }
  }

  function handleDragStart(e: DragStartEvent) {
    const p = projects?.find((x) => x.slug === e.active.id);
    if (p) setActiveDrag(p);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || !projects || active.id === over.id) return;
    const oldIndex = projects.findIndex((p) => p.slug === active.id);
    const newIndex = projects.findIndex((p) => p.slug === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(projects, oldIndex, newIndex);
    saveOrder(newOrder);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                message:
                  "Supprimer les projets avec titre vide (résidus de saves cassés) ? Cette action est irréversible.",
                tone: "danger",
                confirmLabel: "Nettoyer",
              });
              if (!ok) return;
              try {
                const res = await apiFetch(
                  "/cortoba-plateforme/api/published_projects.php?purge_empty=1",
                  { method: "POST" }
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.success === false) {
                  throw new Error(data.error || `HTTP ${res.status}`);
                }
                const n = data.data?.deleted ?? 0;
                toast.success(
                  n > 0
                    ? `${n} projet${n > 1 ? "s" : ""} vide${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}`
                    : "Aucun projet vide à nettoyer"
                );
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              }
            }}
            className="cta-button text-xs"
            title="Supprime les lignes avec titre vide (pollution)"
          >
            🧹 Nettoyer
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="cta-button cta-button-primary text-xs"
          >
            ＋ Nouveau projet
          </button>
        </div>
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
          Glissez en X ou Y pour réorganiser · ✎ pour éditer · 🗑 pour supprimer. L'aperçu correspond exactement au rendu du site public.
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
                : "1400px",
          }}
          transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
          className="mx-auto border border-dashed border-white/5 rounded-lg p-2"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={projects.map((p) => p.slug)}
              strategy={rectSortingStrategy}
            >
              <div
                className={clsx(
                  // Même aspect que le site public : auto-rows 380px + gap 1px.
                  "grid gap-1 auto-rows-[380px]",
                  device === "mobile"
                    ? "grid-cols-1"
                    : device === "tablet"
                    ? "grid-cols-2"
                    : "grid-cols-1 md:grid-cols-3"
                )}
              >
                <AnimatePresence>
                  {projects.map((p) => (
                    <SortableProjectCard
                      key={p.slug}
                      project={p}
                      onEdit={() => setEditing(p)}
                      onDelete={() => handleDelete(p.slug)}
                      deleting={deleting === p.slug}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180 }}>
              {activeDrag ? (
                <ProjectCardVisual project={activeDrag} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
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

// ─── SortableProjectCard ────────────────────────────────────────────────
// Wrapper dnd-kit autour de la carte visuelle. Gère le transform pendant
// le drag et expose les boutons éditer/supprimer.

interface SortableProps {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function SortableProjectCard({
  project,
  onEdit,
  onDelete,
  deleting,
}: SortableProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.slug });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "group cursor-grab active:cursor-grabbing",
        GRID_CLASS_MAP[project.grid_class || ""]
      )}
    >
      <ProjectCardVisual
        project={project}
        onEdit={onEdit}
        onDelete={onDelete}
        deleting={deleting}
      />
    </div>
  );
}

// ─── ProjectCardVisual ─────────────────────────────────────────────────
// Rendu visuel pur — même style que components/ProjectCard.tsx côté public,
// plus un overlay boutons éditer/supprimer au hover.

interface VisualProps {
  project: Project;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** Vrai si rendu dans le DragOverlay (pas de boutons, shadow) */
  overlay?: boolean;
}

function ProjectCardVisual({
  project,
  onEdit,
  onDelete,
  deleting,
  overlay,
}: VisualProps) {
  const pos = parseHeroPosition(project.hero_position);
  return (
    <div
      className={clsx(
        "relative block overflow-hidden w-full h-full",
        overlay && "shadow-2xl ring-2 ring-gold"
      )}
    >
      <div
        className="w-full h-full bg-cover transition-transform duration-500 group-hover:scale-105"
        style={{
          backgroundImage: `url('${project.hero_image}')`,
          backgroundPosition: `${pos.x}% ${pos.y}%`,
        }}
      />
      <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
        <p className="text-[0.62rem] tracking-[0.2em] text-gold uppercase">
          {project.category}
        </p>
        <h3 className="font-serif text-lg text-white font-light mt-0.5 truncate">
          {project.title}
        </h3>
        <p className="text-xs text-fg-muted mt-0.5 truncate">
          {project.location}
          {project.country && `, ${project.country}`}
        </p>
      </div>
      {/* Actions — visibles au hover seulement, pas en overlay */}
      {!overlay && (onEdit || onDelete) && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-8 h-8 rounded-md bg-gold/90 text-bg hover:bg-gold text-xs"
              title="Éditer"
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              className="w-8 h-8 rounded-md bg-red-500/90 text-white hover:bg-red-500 text-xs disabled:opacity-50"
              title="Supprimer"
            >
              {deleting ? "…" : "🗑"}
            </button>
          )}
        </div>
      )}
      {/* Badge grid_class en bas à gauche pour debug admin */}
      {!overlay && project.grid_class && (
        <div className="absolute bottom-2 left-2 text-[0.55rem] tracking-[0.15em] uppercase text-white bg-black/60 px-2 py-0.5 rounded pointer-events-none">
          {project.grid_class}
        </div>
      )}
    </div>
  );
}
