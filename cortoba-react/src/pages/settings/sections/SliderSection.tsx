import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader";
import { SlideEditorModal, type EditableSlide } from "./SlideEditorModal";

interface SliderImage {
  id: number | string;
  image_path: string;
  alt_text?: string;
  fit_mode?: "cover" | "contain" | "original" | "fill";
  position_x?: number;
  position_y?: number;
  zoom?: number;
  animation_type?: string;
}

const FIT_LABELS: Record<string, string> = {
  cover: "Adapté",
  contain: "Contenu",
  original: "Original",
  fill: "Étiré",
};

const ANIM_LABELS: Record<string, string> = {
  "zoom-in": "Zoom ↗",
  "zoom-out": "Zoom ↘",
  "pan-left": "Pan ←",
  "pan-right": "Pan →",
  "pan-up": "Pan ↑",
  "pan-down": "Pan ↓",
  drift: "Drift",
  none: "Statique",
};

/**
 * Settings → Slider accueil.
 * Liste les slides de la home hero avec leur preview. Le legacy a un éditeur
 * modal complet (drag-to-reposition, zoom slider, animation picker) : porté
 * comme stub pour l'instant — voir TODO.
 */
export function SliderSection() {
  const [slides, setSlides] = useState<SliderImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditableSlide | null>(null);

  const load = () => {
    setError(null);
    apiFetch("/cortoba-plateforme/api/slider.php")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || "Erreur serveur");
        setSlides(data.data || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => { load(); }, []);

  async function handleDelete(id: SliderImage["id"]) {
    if (!confirm("Supprimer définitivement cette image du slider ?")) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`/cortoba-plateforme/api/slider.php?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Suppression échouée");
      setSlides((prev) => prev?.filter((s) => s.id !== id) || null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function saveOrder(newOrder: SliderImage[]) {
    setSlides(newOrder); // optimistic
    try {
      // Server expects { ids: [id1, id2, ...] } in the new order OR one PUT per item.
      // On tente d'abord un endpoint batch, sinon on envoie un update par item.
      const ids = newOrder.map((s) => s.id);
      const res = await apiFetch("/cortoba-plateforme/api/slider.php?action=reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        // Fallback : PUT each slide with its new sort_order
        await Promise.all(
          newOrder.map((s, i) =>
            apiFetch("/cortoba-plateforme/api/slider.php", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: s.id, sort_order: i }),
            })
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load(); // revert to server truth on failure
    }
  }

  async function handleNewImage(img: UploadedImage) {
    setSaving(true);
    try {
      // Create the slide with default settings (user can edit after)
      const res = await apiFetch("/cortoba-plateforme/api/slider.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: img.path,
          fit_mode: "cover",
          position_x: 50,
          position_y: 50,
          zoom: 100,
          animation_type: "zoom-in",
          alt_text: "",
          sort_order: (slides?.length || 0),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Erreur serveur");
      load(); // reload full list from server to get the new id
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
          <span className="text-3xl">🎞️</span>
          <h1 className="font-serif text-3xl font-light text-fg">Slider accueil</h1>
          {slides && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {slides.length} image{slides.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ImageUploader
          onUploaded={handleNewImage}
          onError={(msg) => setError(msg)}
          label={saving ? "Enregistrement…" : "＋ Ajouter une image"}
          compact
        />
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300 mb-4">
          ⚠ {error}
        </div>
      )}

      {slides === null && !error && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {slides !== null && slides.length === 0 && (
        <div className="p-16 bg-bg-card border border-white/5 rounded-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3 opacity-40">🖼️</div>
            <p className="text-sm text-fg-muted">Aucune image dans le slider.</p>
          </div>
          <div className="max-w-md mx-auto">
            <ImageUploader
              onUploaded={handleNewImage}
              onError={(msg) => setError(msg)}
              label="Glissez la première image ou cliquez"
            />
          </div>
        </div>
      )}

      {slides !== null && slides.length > 0 && (
        <>
          <p className="text-xs text-fg-muted mb-3 flex items-center gap-2">
            <span>⋮⋮</span>
            Glissez les vignettes pour changer l'ordre.
          </p>
          <Reorder.Group
            as="div"
            axis="y"
            values={slides}
            onReorder={saveOrder}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence>
              {slides.map((s, i) => {
                const posX = s.position_x ?? 50;
                const posY = s.position_y ?? 50;
                const zm = s.zoom ?? 100;
                const fit = s.fit_mode || "cover";
                const anim = s.animation_type || "zoom-in";
                return (
                  <Reorder.Item
                    as="div"
                    key={s.id}
                    value={s}
                    whileDrag={{
                      scale: 1.03,
                      boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                      zIndex: 10,
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.35, delay: i * 0.04 }}
                    className="relative bg-bg-card border border-white/5 rounded-md overflow-hidden group cursor-grab active:cursor-grabbing"
                  >
                    <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-gold text-bg font-bold text-xs flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(s as EditableSlide);
                        }}
                        className="w-8 h-8 rounded-md bg-gold/90 text-bg hover:bg-gold text-xs"
                        title="Modifier"
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
                    <div className="relative h-40 overflow-hidden bg-black/50 pointer-events-none">
                      <img
                        src={s.image_path}
                        alt={s.alt_text || `Slide ${i + 1}`}
                        className="w-full h-full"
                        style={{
                          objectFit:
                            fit === "original" ? "none" : (fit as React.CSSProperties["objectFit"]),
                          objectPosition: `${posX}% ${posY}%`,
                          transform: `scale(${zm / 100})`,
                        }}
                        loading="lazy"
                      />
                    </div>
                    <div className="p-2 text-center text-[0.65rem] text-fg-muted tracking-wider">
                      {FIT_LABELS[fit] || fit} · {zm}% · {ANIM_LABELS[anim] || anim}
                    </div>
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        </>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 p-4 bg-gold/5 border border-gold-dim/30 rounded-md text-xs text-fg-muted leading-relaxed"
      >
        ✅ Upload d'image + éditeur complet (position / zoom / animation /
        fit / alt text) + suppression. TODO restant : drag-to-reorder via{" "}
        <code>Reorder.Group</code>, éditeur avec drag pour repositionner
        visuellement l'image sur la preview.
      </motion.div>

      <SlideEditorModal
        open={editing !== null}
        slide={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { load(); setEditing(null); }}
      />
    </div>
  );
}
