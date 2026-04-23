import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

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
 * Consomme /cortoba-plateforme/api/landscaping_slider.php
 */
export function LandscapingSliderSection() {
  const [slides, setSlides] = useState<LsSlide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/landscaping_slider.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setSlides(list);
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
        <button
          type="button"
          className="cta-button cta-button-primary text-xs"
        >
          ＋ Ajouter une image
        </button>
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {!error && slides === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {!error && slides !== null && slides.length === 0 && (
        <div className="p-16 text-center bg-bg-card border border-dashed border-white/10 rounded-md">
          <div className="text-4xl mb-3 opacity-40">🖼️</div>
          <p className="text-sm text-fg-muted">
            Aucune image dans le slider landscaping.
          </p>
        </div>
      )}

      {!error && slides !== null && slides.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {slides.map((s, i) => {
              const px = s.position_x ?? 50;
              const py = s.position_y ?? 50;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                  whileHover={{ y: -3 }}
                  className="relative bg-bg-card border border-white/5 rounded-md overflow-hidden group"
                >
                  <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-[#8dba78] text-bg font-bold text-xs flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div
                    className="h-40 bg-cover bg-center"
                    style={{
                      backgroundImage: `url('${s.image_path}')`,
                      backgroundPosition: `${px}% ${py}%`,
                      backgroundColor: s.bg_color || "#1a2815",
                    }}
                  />
                  <div className="p-2 text-[0.65rem] text-fg-muted text-center">
                    Position {px}% / {py}%
                    {s.bg_color && ` · ${s.bg_color}`}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
