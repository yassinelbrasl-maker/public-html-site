import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfigurator } from "../context";
import { StepNav } from "../StepNav";
import { StepHeading } from "./_shared";
import { STYLES, STANDINGS } from "../data";
import clsx from "clsx";

export function Step4Identite() {
  const { state, dispatch, error } = useConfigurator();

  return (
    <>
      <StepHeading num="04" title="🎨 Identité visuelle & qualité">
        Projetez-vous dans l'esthétique et le confort de votre futur espace.
      </StepHeading>

      {/* Style architectural */}
      <div className="mb-10">
        <label className="block text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-3">
          Style architectural
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STYLES.map((s) => {
            const selected = state.cfg_style === s.id;
            return (
              <motion.button
                key={s.id}
                type="button"
                onClick={() =>
                  dispatch({ type: "SET", key: "cfg_style", value: s.id })
                }
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  "relative overflow-hidden rounded-md border text-left transition-colors group",
                  selected
                    ? "border-gold bg-gold/5"
                    : "border-white/10 hover:border-gold-dim"
                )}
              >
                <div className="grid grid-cols-3 gap-1">
                  {s.photos.map((p, i) => (
                    <div
                      key={i}
                      className="aspect-square bg-cover bg-center"
                      style={{ backgroundImage: `url('${p}')` }}
                    />
                  ))}
                </div>
                <div className="p-4">
                  <strong className={clsx("block mb-1 text-sm", selected && "text-gold")}>
                    {s.title}
                  </strong>
                  <span className="block text-xs text-fg-muted leading-relaxed">
                    {s.desc}
                  </span>
                  {selected && (
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gold text-bg flex items-center justify-center text-sm font-bold"
                    >
                      ✓
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Standing */}
      <div className="mb-10">
        <label className="block text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-3">
          Niveau de standing
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STANDINGS.map((s) => (
            <StandingCard
              key={s.id}
              option={s}
              selected={state.cfg_standing === s.id}
              onSelect={() =>
                dispatch({ type: "SET", key: "cfg_standing", value: s.id })
              }
            />
          ))}
        </div>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-400 mb-6"
        >
          ⚠ {error}
        </motion.p>
      )}

      <StepNav />
    </>
  );
}

function StandingCard({
  option,
  selected,
  onSelect,
}: {
  option: (typeof STANDINGS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={clsx(
        "relative rounded-md border p-5 cursor-pointer transition-colors",
        selected ? "border-gold bg-gold/5" : "border-white/10 hover:border-gold-dim"
      )}
      onClick={onSelect}
    >
      <div className="text-3xl mb-3">{option.icon}</div>
      <div className="flex items-center gap-2 mb-1">
        <strong className={clsx("text-sm", selected && "text-gold")}>
          {option.title}
        </strong>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowTooltip((t) => !t);
          }}
          className="w-5 h-5 rounded-full border border-gold-dim text-gold text-xs hover:bg-gold hover:text-bg transition-colors"
          aria-label="Plus d'informations"
        >
          i
        </button>
      </div>
      <span className="block text-xs text-fg-muted leading-relaxed">{option.blurb}</span>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 bottom-full mb-2 z-10 p-4 bg-bg-elev border border-gold-dim rounded-md text-xs text-fg leading-relaxed shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <strong className="block text-gold mb-2">Standing {option.title}</strong>
            {option.tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
