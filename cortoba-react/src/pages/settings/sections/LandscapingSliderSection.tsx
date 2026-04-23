import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/ToastProvider";
import { LsSlideEditorModal, type EditableLsSlide } from "./LsSlideEditorModal";

interface LsSlide {
  id: number | string;
  image_path: string;
  alt_text?: string;
  bg_color?: string;
  position_x?: number;
  position_y?: number;
}

/**
 * Settings → Slider héro Landscaping.
 * Full CRUD : upload, éditeur (position, bg_color, alt_text), delete, reorder.
 */
export function LandscapingSliderSection() {
  const [slides, setSlides] = useState<LsSlide[] | null>(null);
  const [editing, setEditing] = useState<EditableLsSlide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | number | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    apiFetch("/cortoba-plateforme/api/landscaping_slider.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setSlides(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => { load(); }, []);

  async function handleNewImage(img: UploadedImage) {
    try {
      const res = await apiFetch("/cortoba-plateforme/api/landscaping_slider.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: img.path,
          bg_color: "#1a2815",
          position_x: 50,
          position_y: 50,
          sort_order: slides?.length || 0,
        }),
      });
      if (!res.ok) throw new Error("Création échouée");
      toast.success("Image ajoutée au slider Landscaping");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: string | number) {
    const ok = await confirm({
      message: "Supprimer cette image du slider Landscaping ?",
      tone: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setDeleting(id);
    try {
      const res = await apiFetch(
        `/cortoba-plateforme/api/landscaping_slider.php?id=${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Suppression échouée");
      setSlides((prev) => prev?.filter((s) => s.id !== id) || null);
      toast.success("Image supprimée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function saveOrder(newOrder: LsSlide[]) {
    setSlides(newOrder);
    try {
      const ids = newOrder.map((s) => s.id);
      const res = await apiFetch(
        "/cortoba-plateforme/api/landscaping_slider.php?action=reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }
      );
      if (!res.ok) {
        await Promise.all(
          newOrder.map((s, i) =>
            apiFetch("/cortoba-plateforme/api/landscaping_slider.php", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: s.id, sort_order: i }),
            })
          )
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
          <span className="text-3xl">🖼️</span>
          <h1 className="font-serif text-3xl font-light text-fg">
            Slider héro — Landscaping
          </h1>
          {slides && (
            <span className="px-3 py-1 rounded-full bg-[#8dba78]/15 text-[#8dba78] text-xs tracking-wider">
              {slides.length}
            </span>
          )}
        </div>
        <ImageUploader
          onUploaded={handleNewImage}
          onError={setError}
          label="＋ Ajouter une image"
          compact
        />
      </motion.div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="text-fg-muted hover:text-fg">
            ×
          </button>
        </div>
      )}

      {slides === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {slides !== null && slides.length === 0 && (
        <div className="p-16 bg-bg-card border border-white/5 rounded-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3 opacity-40">🖼️</div>
            <p className="text-sm text-fg-muted">
              Aucune image dans le slider landscaping.
            </p>
          </div>
          <div className="max-w-md mx-auto">
            <ImageUploader
              onUploaded={handleNewImage}
              onError={setError}
              label="Glissez la première image ou cliquez"
            />
          </div>
        </div>
      )}

      {slides !== null && slides.length > 0 && (
        <>
          <p className="text-xs text-fg-muted mb-3 flex items-center gap-2">
            <span>⋮⋮</span>
            Glissez pour réorganiser · ✎ pour éditer · 🗑 pour supprimer.
          </p>
          {/* Liste verticale — Reorder.Group de framer-motion est 1D. */}
          <Reorder.Group
            as="div"
            axis="y"
            values={slides}
            onReorder={saveOrder}
            className="flex flex-col gap-3"
          >
            <AnimatePresence>
              {slides.map((s, i) => {
                const px = s.position_x ?? 50;
                const py = s.position_y ?? 50;
                return (
                  <Reorder.Item
                    as="div"
                    key={s.id}
                    value={s}
                    whileDrag={{
                      scale: 1.01,
                      boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                      zIndex: 10,
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                    className="relative bg-bg-card border border-white/5 rounded-md overflow-hidden group cursor-grab active:cursor-grabbing flex items-stretch"
                  >
                    <div className="shrink-0 w-14 flex items-center justify-center bg-bg-card border-r border-white/5">
                      <div className="w-8 h-8 rounded-full bg-[#8dba78] text-bg font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </div>
                    </div>
                    <div
                      className="w-48 shrink-0 h-28 bg-cover bg-center pointer-events-none"
                      style={{
                        backgroundImage: `url('${s.image_path}')`,
                        backgroundPosition: `${px}% ${py}%`,
                        backgroundColor: s.bg_color || "#1a2815",
                      }}
                    />
                    <div className="flex-1 p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 text-[0.7rem] text-fg-muted">
                        Position {px}% / {py}%
                        {s.bg_color && (
                          <span
                            className="inline-block w-3 h-3 rounded-full ml-2 align-middle border border-white/20"
                            style={{ backgroundColor: s.bg_color }}
                          />
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(s as EditableLsSlide);
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
                            handleDelete(s.id);
                          }}
                          disabled={deleting === s.id}
                          className="w-8 h-8 rounded-md bg-red-500/90 text-white hover:bg-red-500 text-xs disabled:opacity-50"
                          title="Supprimer"
                        >
                          {deleting === s.id ? "…" : "🗑"}
                        </button>
                      </div>
                    </div>
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        </>
      )}

      <LsSlideEditorModal
        open={editing !== null}
        slide={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          load();
          setEditing(null);
          toast.success("Slide Landscaping mise à jour");
        }}
      />
    </div>
  );
}
