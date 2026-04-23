import { motion } from "framer-motion";
import { useConfigurator } from "../context";
import { StepHeading } from "./_shared";
import { StepNav } from "../StepNav";
import clsx from "clsx";

/**
 * Step 5 — Programme (version simplifiée).
 *
 * Le legacy a un programme plus riche (logement vs immeuble, liste dynamique de
 * chambres, suite parentale avec variants, cuisine ouverte/fermée + option table,
 * etc.). Ici on garde l'essentiel : compteurs numériques, type de cuisine,
 * toggles. Les variantes avancées sont à terminer (voir TODO en bas du fichier).
 */
export function Step5Programme() {
  const { state, dispatch } = useConfigurator();

  function patch(p: Partial<typeof state>) {
    dispatch({ type: "PATCH", patch: p });
  }

  return (
    <>
      <StepHeading num="05" title="📋 Le programme">
        Détaillez votre façon de vivre. Ces informations alimentent notre moteur de calcul.
      </StepHeading>

      <Section label="Configuration des niveaux">
        <CounterField
          label="Niveaux"
          value={state.cfg_niveaux}
          min={1}
          max={10}
          onChange={(v) => patch({ cfg_niveaux: v })}
        />
      </Section>

      <Section label="Espaces de nuit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <CounterField
            label="Chambres"
            value={state.cfg_chambres}
            min={0}
            max={12}
            onChange={(v) => patch({ cfg_chambres: v })}
          />
          <CounterField
            label="Salles de bain"
            value={state.cfg_salles_bain}
            min={0}
            max={8}
            onChange={(v) => patch({ cfg_salles_bain: v })}
          />
        </div>
      </Section>

      <Section label="Cuisine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { id: "ouverte", icon: "🍳", title: "Ouverte sur le salon", sub: "Espace fluide, convivial et lumineux" },
            { id: "independante", icon: "🚪", title: "Indépendante", sub: "Cuisine fermée avec porte" },
          ].map((opt) => {
            const selected = state.cfg_cuisine_type === opt.id;
            return (
              <motion.button
                key={opt.id}
                type="button"
                onClick={() => patch({ cfg_cuisine_type: opt.id })}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  "p-4 rounded-md border text-left flex items-start gap-3 transition-colors",
                  selected
                    ? "border-gold bg-gold/5"
                    : "border-white/10 hover:border-gold-dim"
                )}
              >
                <span className="text-xl">{opt.icon}</span>
                <div>
                  <strong className={clsx("block text-sm", selected && "text-gold")}>
                    {opt.title}
                  </strong>
                  <small className="text-xs text-fg-muted leading-relaxed">
                    {opt.sub}
                  </small>
                </div>
              </motion.button>
            );
          })}
        </div>
      </Section>

      <Section label="Équipements & espaces annexes">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Toggle
            label="🛋️ Salon"
            checked={state.cfg_salon}
            onChange={(b) => patch({ cfg_salon: b })}
          />
          <Toggle
            label="🚗 Garage"
            checked={state.cfg_garage}
            onChange={(b) => patch({ cfg_garage: b })}
          />
          <Toggle
            label="🏊 Piscine"
            checked={state.cfg_piscine}
            onChange={(b) => patch({ cfg_piscine: b })}
          />
          <Toggle
            label="🌳 Jardin"
            checked={state.cfg_jardin}
            onChange={(b) => patch({ cfg_jardin: b })}
          />
        </div>
      </Section>

      {/* Placeholder pour les variantes non portées */}
      <div className="mt-10 p-4 bg-bg-card border border-white/10 rounded-md text-xs text-fg-muted italic leading-relaxed">
        <strong className="text-gold not-italic">TODO</strong> — variantes avancées du
        legacy à porter : liste dynamique de chambres avec config par chambre, suite
        parentale avec variants (dressing / placard), option « table à manger » dans
        cuisine indépendante, configuration dédiée par type d'immeuble (commercial,
        mixte, bureautique), cfg_mixte_niveaux builder.
      </div>

      <StepNav />
    </>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <p className="text-xs italic text-gold border-l-2 border-gold pl-3 mb-4">
        {label}
      </p>
      {children}
    </div>
  );
}

function CounterField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2 bg-bg-card border border-white/10 rounded-md p-2 w-fit">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-9 h-9 rounded-md border border-white/10 hover:border-gold hover:text-gold text-fg text-lg flex items-center justify-center disabled:opacity-30"
          disabled={value <= min}
        >
          −
        </button>
        <span className="w-14 text-center text-fg text-lg font-medium">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-9 h-9 rounded-md border border-white/10 hover:border-gold hover:text-gold text-fg text-lg flex items-center justify-center disabled:opacity-30"
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        "p-4 rounded-md border flex items-center gap-3 transition-colors text-left",
        checked
          ? "border-gold bg-gold/5 text-gold"
          : "border-white/10 hover:border-gold-dim text-fg-muted"
      )}
    >
      <div
        className={clsx(
          "w-4 h-4 rounded-sm border flex items-center justify-center text-[10px]",
          checked ? "border-gold bg-gold text-bg" : "border-white/20"
        )}
      >
        {checked && "✓"}
      </div>
      <span className="text-sm">{label}</span>
    </motion.button>
  );
}
