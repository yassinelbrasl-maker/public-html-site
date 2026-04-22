import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  images: string[];
  index: number | null;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}

export function Lightbox({ images, index, onClose, onNavigate }: Props) {
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate((index + 1) % images.length);
      if (e.key === "ArrowLeft")
        onNavigate((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {index !== null && (
        <motion.div
          key="lightbox"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={images[index]}
              src={images[index]}
              alt=""
              className="max-w-[92vw] max-h-[88vh] object-contain"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            />
          </AnimatePresence>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate((index - 1 + images.length) % images.length);
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white border border-white/20 hover:border-gold hover:text-gold flex items-center justify-center"
                aria-label="Précédent"
              >
                ←
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate((index + 1) % images.length);
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white border border-white/20 hover:border-gold hover:text-gold flex items-center justify-center"
                aria-label="Suivant"
              >
                →
              </button>
            </>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-black/70 text-white border border-white/15 hover:border-gold hover:text-gold flex items-center justify-center text-xl"
            aria-label="Fermer"
          >
            ×
          </button>

          {/* Counter */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/70 tracking-wider">
            {index + 1} / {images.length}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
