import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone, duration?: number) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Système de notifications toast (non-bloquant).
 * Apparaît en bas à droite, disparaît automatiquement.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback(
    (message: string, tone: ToastTone = "info", duration = 4000) => {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
      setToasts((t) => [...t, { id, message, tone, duration }]);
      if (duration > 0) {
        setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id));
        }, duration);
      }
    },
    []
  );

  const api: ToastApi = {
    show,
    success: (msg) => show(msg, "success"),
    error: (msg) => show(msg, "error"),
    info: (msg) => show(msg, "info"),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-6 right-6 z-[400] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{
                duration: 0.25,
                ease: [0.22, 0.61, 0.36, 1],
              }}
              className={clsx(
                "pointer-events-auto min-w-[240px] max-w-[360px] px-4 py-3 rounded-md border text-sm shadow-lg backdrop-blur-sm flex items-start gap-2",
                t.tone === "success" &&
                  "bg-green-500/15 border-green-500/40 text-green-100",
                t.tone === "error" &&
                  "bg-red-500/15 border-red-500/40 text-red-100",
                t.tone === "info" &&
                  "bg-bg-card/95 border-gold-dim/40 text-fg"
              )}
            >
              <span className="text-base shrink-0">
                {t.tone === "success" && "✓"}
                {t.tone === "error" && "⚠"}
                {t.tone === "info" && "ℹ"}
              </span>
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="text-inherit opacity-60 hover:opacity-100 text-xs"
                aria-label="Fermer"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used within ToastProvider");
  return api;
}
