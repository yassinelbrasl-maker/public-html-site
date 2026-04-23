import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import {
  LsProjectEditorModal,
  type EditableLsProject,
} from "./LsProjectEditorModal";

interface LsProject extends EditableLsProject {
  id: number | string;
}

/**
 * Settings → Projets paysagers (Landscaping).
 * Full CRUD : liste + upload + édition + suppression + drag-to-reorder.
 */
export function LandscapingProjectsSection() {
  const [items, setItems] = useState<LsProject[] | null>(null);
  const [editing, setEditing] = useState<EditableLsProject | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | number | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    apiFetch("/cortoba-plateforme/api/landscaping_projects.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string | number) {
    if (!confirm("Supprimer définitivement ce projet paysager ?")) return;
    setDeleting(id);
    try {
      const res = await apiFetch(
        `/cortoba-plateforme/api/landscaping_projects.php?id=${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Suppression échouée");
      setItems((prev) => prev?.filter((p) => p.id !== id) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function saveOrder(newOrder: LsProject[]) {
    setItems(newOrder);
    try {
      const ids = newOrder.map((p) => p.id);
      const res = await apiFetch(
        "/cortoba-plateforme/api/landscaping_projects.php?action=reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }
      );
      if (!res.ok) {
        await Promise.all(
          newOrder.map((p, i) =>
            apiFetch("/cortoba-plateforme/api/landscaping_projects.php", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: p.id, sort_order: i }),
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
          <span className="text-3xl">🌿</span>
          <h1 className="font-serif text-3xl font-light text-fg">
            Projets paysagers
          </h1>
          {items && (
            <span className="px-3 py-1 rounded-full bg-[#8dba78]/15 text-[#8dba78] text-xs tracking-wider">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="cta-button cta-button-primary text-xs"
        >
          ＋ Nouveau projet paysager
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

      {items && items.length > 0 && (
        <p className="text-xs text-fg-muted mb-4 flex items-center gap-2">
          <span>⋮⋮</span>
          Glissez pour réorganiser · ✎ pour éditer · 🗑 pour supprimer.
        </p>
      )}

      {items === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {items !== null && items.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted bg-bg-card border border-dashed border-white/10 rounded-md">
          Aucun projet paysager.{" "}
          <button
            onClick={() => setCreating(true)}
            className="text-[#8dba78] hover:underline"
          >
            Créer le premier
          </button>
          .
        </div>
      )}

      {items !== null && items.length > 0 && (
        <Reorder.Group
          as="div"
          axis="y"
          values={items}
          onReorder={saveOrder}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {items.map((p) => (
              <Reorder.Item
                as="div"
                key={p.id}
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
                  {p.hero_image ? (
                    <div
                      className="aspect-[16/10] bg-cover bg-center pointer-events-none"
                      style={{ backgroundImage: `url('${p.hero_image}')` }}
                    />
                  ) : (
                    <div className="aspect-[16/10] bg-black/50 flex items-center justify-center text-fg-muted pointer-events-none">
                      📷
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                      className="w-8 h-8 rounded-md bg-[#8dba78]/90 text-bg hover:bg-[#8dba78] text-xs"
                      title="Éditer"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                      disabled={deleting === p.id}
                      className="w-8 h-8 rounded-md bg-red-500/90 text-white hover:bg-red-500 text-xs disabled:opacity-50"
                      title="Supprimer"
                    >
                      {deleting === p.id ? "…" : "🗑"}
                    </button>
                  </div>
                </div>
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
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      <LsProjectEditorModal
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
