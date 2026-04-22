import { motion } from "framer-motion";
import { useConfigurator } from "./context";
import { STEP_LABELS } from "./state";
import clsx from "clsx";

const NUMERIC_STEPS = [1, 2, 3, 4, 5, 6] as const;

/** Stepper horizontal avec pastilles numérotées. */
export function Stepper() {
  const { step } = useConfigurator();
  const active = typeof step === "number" ? step : 7; // client/success = past all

  return (
    <div className="flex items-center justify-center gap-2 md:gap-4 px-4 md:px-8 py-6 max-w-5xl mx-auto flex-wrap">
      {NUMERIC_STEPS.map((n, i) => {
        const done = active > n;
        const current = active === n;
        return (
          <div key={n} className="flex items-center">
            <motion.div
              animate={{ scale: current ? 1.08 : 1 }}
              transition={{ duration: 0.3 }}
              className={clsx(
                "flex items-center gap-2 transition-colors",
                current && "text-gold",
                done && "text-gold-dim",
                !current && !done && "text-fg-muted"
              )}
            >
              <div
                className={clsx(
                  "w-8 h-8 rounded-full border flex items-center justify-center text-xs font-semibold",
                  current && "border-gold bg-gold/10",
                  done && "border-gold bg-gold text-bg",
                  !current && !done && "border-white/10"
                )}
              >
                {n}
              </div>
              <span className="text-[0.65rem] tracking-[0.2em] uppercase hidden md:inline">
                {STEP_LABELS[n]}
              </span>
            </motion.div>
            {i < NUMERIC_STEPS.length - 1 && (
              <div
                className={clsx(
                  "w-8 md:w-16 h-px mx-2 md:mx-3 transition-colors",
                  done ? "bg-gold" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StepIndicatorPill() {
  const { step } = useConfigurator();
  if (typeof step !== "number") return null;
  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="mx-auto mt-2 mb-4 inline-flex items-center gap-2 bg-gold/10 border border-gold-dim text-gold text-[0.65rem] tracking-[0.2em] uppercase font-semibold px-4 py-1.5 rounded-full"
    >
      Étape {step} / 6 · {STEP_LABELS[step as 1 | 2 | 3 | 4 | 5 | 6]}
    </motion.div>
  );
}
