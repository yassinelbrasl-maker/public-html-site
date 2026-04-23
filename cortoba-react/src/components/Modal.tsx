import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** "md" (default ~520px), "lg" (~720px), "xl" (~960px). */
  size?: "sm" | "md" | "lg" | "xl";
  /** Pied du modal (boutons). Aligné à droite par défaut. */
  footer?: ReactNode;
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/**
 * Modal réutilisable — backdrop flou, AnimatePresence, ESC close, pas de
 * scroll du body pendant l'ouverture. Utilisé par tous les éditeurs admin.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-6"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{
              duration: 0.28,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            className={`relative w-full ${SIZES[size]} max-h-[90vh] flex flex-col bg-bg-elev border border-white/10 rounded-xl overflow-hidden shadow-2xl`}
          >
            {title && (
              <div className="flex items-center justify-between gap-4 p-5 border-b border-white/5">
                <h3 className="font-serif text-xl text-fg">{title}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-white/10 hover:border-gold hover:text-gold text-fg-muted transition-colors"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
            )}
            <div className="overflow-auto p-5 flex-1">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-white/5 bg-bg-card">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
