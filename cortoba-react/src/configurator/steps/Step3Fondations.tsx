import { motion, AnimatePresence } from "framer-motion";
import { useConfigurator } from "../context";
import { StepNav } from "../StepNav";
import { StepHeading } from "./_shared";
import { TYPES_BATIMENT, OPERATIONS, TERRAIN_NATURES } from "../data";
import clsx from "clsx";

export function Step3Fondations() {
  const { state, dispatch, error } = useConfigurator();

  function selectSubtype(subId: string, groupId: string) {
    dispatch({
      type: "PATCH",
      patch: { cfg_type: subId, cfg_type_group: groupId },
    });
  }

  return (
    <>
      <StepHeading num="03" title="🛠️ Les fondations du projet">
        Définissez le type, la nature de l'opération et votre budget.
      </StepHeading>

      {/* Type de bâtiment */}
      <Field label="Type de bâtiment">
        <div className="space-y-3">
          {TYPES_BATIMENT.map((group) => {
            const open = state.cfg_type_group === group.id;
            return (
              <div key={group.id}>
                <motion.button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "PATCH",
                      patch: {
                        cfg_type_group: open ? null : group.id,
                        // Deselect subtype if closing
                        cfg_type: open ? null : state.cfg_type,
                      },
                    })
                  }
                  whileHover={{ scale: 1.005 }}
                  className={clsx(
                    "w-full flex items-center justify-between gap-3 p-4 rounded-md border transition-colors",
                    open
                      ? "border-gold bg-gold/5 text-gold"
                      : "border-white/10 hover:border-gold-dim"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{group.icon}</span>
                    <strong className="text-sm">{group.label}</strong>
                  </div>
                  <span
                    className={clsx(
                      "transition-transform text-xs",
                      open && "rotate-180"
                    )}
                  >
                    ▾
                  </span>
                </motion.button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="sub"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 pl-2">
                        {group.subtypes.map((st) => {
                          const selected = state.cfg_type === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => selectSubtype(st.id, group.id)}
                              className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-colors",
                                selected
                                  ? "border-gold bg-gold/10 text-gold"
                                  : "border-white/10 hover:border-gold-dim text-fg-muted"
                              )}
                            >
                              <span className="text-lg">{st.icon}</span>
                              <span className="text-sm">{st.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Field>

      {/* Nature de l'opération */}
      <Field label="Nature de l'opération">
        <RadioCards
          options={OPERATIONS}
          selected={state.cfg_operation}
          onSelect={(id) =>
            dispatch({ type: "SET", key: "cfg_operation", value: id })
          }
        />
      </Field>

      {/* Surface de terrain */}
      <Field label="Surface de terrain" optional>
        <NumericStepper
          value={state.cfg_terrain}
          step={50}
          unit="m²"
          disabled={state.cfg_terrainUnknown}
          onChange={(v) =>
            dispatch({ type: "SET", key: "cfg_terrain", value: v })
          }
        />
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={state.cfg_terrainUnknown}
            onChange={(e) =>
              dispatch({
                type: "SET",
                key: "cfg_terrainUnknown",
                value: e.target.checked,
              })
            }
            className="accent-gold"
          />
          Je n'ai pas encore de terrain
        </label>
      </Field>

      {/* Nature du terrain */}
      <Field label="Nature du terrain">
        <RadioCards
          options={TERRAIN_NATURES}
          selected={state.cfg_terrain_nature}
          onSelect={(id) =>
            dispatch({ type: "SET", key: "cfg_terrain_nature", value: id })
          }
        />
      </Field>

      {/* Budget */}
      <Field label="Budget envisagé">
        <NumericStepper
          value={state.cfg_budget_custom}
          step={10000}
          unit="€"
          onChange={(v) =>
            dispatch({ type: "SET", key: "cfg_budget_custom", value: v })
          }
          maxWidth="420px"
        />
        {/* NB : la conversion EUR → DT temps réel du legacy configurateur est
            un nice-to-have à porter plus tard (fetch d'un taux de change). */}
      </Field>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-400 mt-4"
        >
          ⚠ {error}
        </motion.p>
      )}

      <StepNav />
    </>
  );
}

// ─── Reusable UI primitives (could be moved to /components if reused elsewhere) ───

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <label className="block text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-3">
        {label}
        {optional && <span className="ml-2 text-fg-muted/60 normal-case">— optionnel</span>}
      </label>
      {children}
    </div>
  );
}

interface RadioOpt {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

function RadioCards({
  options,
  selected,
  onSelect,
}: {
  options: RadioOpt[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {options.map((o) => {
        const isSelected = selected === o.id;
        return (
          <motion.button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              "p-4 rounded-md border text-left flex flex-col gap-2 transition-colors",
              isSelected
                ? "border-gold bg-gold/5"
                : "border-white/10 hover:border-gold-dim"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "w-3 h-3 rounded-full border transition-colors",
                  isSelected ? "border-gold bg-gold" : "border-white/30"
                )}
              />
              <span className="text-xl">{o.icon}</span>
            </div>
            <strong className={clsx("text-sm", isSelected && "text-gold")}>
              {o.title}
            </strong>
            <small className="text-xs text-fg-muted leading-relaxed">
              {o.subtitle}
            </small>
          </motion.button>
        );
      })}
    </div>
  );
}

function NumericStepper({
  value,
  step,
  unit,
  disabled,
  onChange,
  maxWidth,
}: {
  value: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  maxWidth?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 bg-bg-card border border-white/10 rounded-md p-2 w-full",
        disabled && "opacity-40 pointer-events-none"
      )}
      style={{ maxWidth: maxWidth || "320px" }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - step))}
        className="w-9 h-9 rounded-md border border-white/10 hover:border-gold hover:text-gold text-fg text-lg flex items-center justify-center"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="flex-1 bg-transparent text-center text-fg text-lg focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="w-9 h-9 rounded-md border border-white/10 hover:border-gold hover:text-gold text-fg text-lg flex items-center justify-center"
      >
        +
      </button>
      <span className="text-xs text-fg-muted pr-2">{unit}</span>
    </div>
  );
}
