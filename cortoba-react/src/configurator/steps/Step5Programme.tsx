import { motion, AnimatePresence } from "framer-motion";
import { useConfigurator } from "../context";
import { StepHeading } from "./_shared";
import { StepNav } from "../StepNav";
import type { Chambre, NiveauMixte } from "../state";
import clsx from "clsx";

/**
 * Step 5 — Programme (version enrichie).
 *
 * Port des variantes legacy cfgRenderChambres + cfgToggleSuiteParentale
 * + cfg_cuisine + cfg_sejour/entree/bureau/sport/buanderie/cellier.
 * La liste des chambres est dynamique (ajout / suppression / type par chambre).
 */

const CHAMBRE_TYPES: { id: Chambre["type"]; label: string; icon: string }[] = [
  { id: "simple", label: "Simple", icon: "🛏️" },
  { id: "double", label: "Double", icon: "🛋️" },
  { id: "double_balcon", label: "Double + balcon", icon: "🌇" },
  { id: "suite", label: "Suite", icon: "✨" },
];

const MIXTE_USAGES: { id: string; label: string; icon: string }[] = [
  { id: "logement", label: "Logement", icon: "🏠" },
  { id: "bureau", label: "Bureau", icon: "💼" },
  { id: "commerce", label: "Commerce", icon: "🏪" },
  { id: "parking", label: "Parking", icon: "🚗" },
  { id: "stockage", label: "Stockage", icon: "📦" },
];

export function Step5Programme() {
  const { state, dispatch } = useConfigurator();

  function patch(p: Partial<typeof state>) {
    dispatch({ type: "PATCH", patch: p });
  }

  // ── cfg_mixte_niveaux builder helpers ──
  function addNiveauMixte() {
    const next: NiveauMixte[] = [
      ...state.cfg_mixte_niveaux,
      { usage: "logement", surface: 300 },
    ];
    patch({ cfg_mixte_niveaux: next });
  }
  function updateNiveauMixte(idx: number, partial: Partial<NiveauMixte>) {
    patch({
      cfg_mixte_niveaux: state.cfg_mixte_niveaux.map((n, i) =>
        i === idx ? { ...n, ...partial } : n
      ),
    });
  }
  function removeNiveauMixte(idx: number) {
    patch({
      cfg_mixte_niveaux: state.cfg_mixte_niveaux.filter((_, i) => i !== idx),
    });
  }

  const isMixte = state.cfg_type === "mixte";

  function addChambre() {
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : "c_" + Math.random().toString(36).slice(2, 9);
    patch({
      cfg_chambres_list: [...state.cfg_chambres_list, { id, type: "simple" }],
    });
  }

  function updateChambre(id: string, type: Chambre["type"]) {
    patch({
      cfg_chambres_list: state.cfg_chambres_list.map((c) =>
        c.id === id ? { ...c, type } : c
      ),
    });
  }

  function removeChambre(id: string) {
    patch({
      cfg_chambres_list: state.cfg_chambres_list.filter((c) => c.id !== id),
    });
  }

  return (
    <>
      <StepHeading num="05" title="📋 Le programme">
        Détaillez votre façon de vivre. Ces informations alimentent notre moteur de calcul.
      </StepHeading>

      {/* Configuration des niveaux */}
      <Section label="Configuration des niveaux">
        <CounterField
          label="Niveaux"
          value={state.cfg_niveaux}
          min={1}
          max={10}
          onChange={(v) => patch({ cfg_niveaux: v })}
        />
      </Section>

      {/* Espaces de vie */}
      <Section label="Espaces de vie">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Toggle
            label="🛋️ Salon"
            checked={state.cfg_salon}
            onChange={(b) => patch({ cfg_salon: b })}
          />
          <Toggle
            label="🪑 Séjour"
            checked={state.cfg_sejour}
            onChange={(b) => patch({ cfg_sejour: b })}
          />
          <Toggle
            label="🚪 Entrée"
            checked={state.cfg_entree}
            onChange={(b) => patch({ cfg_entree: b })}
          />
        </div>
      </Section>

      {/* Cuisine */}
      <Section label="Cuisine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {[
            {
              id: "ouverte",
              icon: "🍳",
              title: "Ouverte sur le salon",
              sub: "Espace fluide, convivial et lumineux",
            },
            {
              id: "independante",
              icon: "🚪",
              title: "Indépendante",
              sub: "Cuisine fermée avec porte",
            },
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
        <AnimatePresence>
          {state.cfg_cuisine_type === "independante" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <label className="inline-flex items-center gap-2 text-xs text-fg-muted cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={state.cfg_cuisine_table}
                  onChange={(e) => patch({ cfg_cuisine_table: e.target.checked })}
                  className="accent-gold"
                />
                Contient une table à manger (+12 m²)
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* Chambres dynamiques */}
      <Section label="Chambres">
        <AnimatePresence>
          {state.cfg_chambres_list.map((c, idx) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-2 mb-2"
            >
              <span className="w-8 text-xs text-fg-muted tabular-nums">
                #{idx + 1}
              </span>
              <select
                value={c.type}
                onChange={(e) =>
                  updateChambre(c.id, e.target.value as Chambre["type"])
                }
                className="flex-1 bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg text-sm focus:outline-none focus:border-gold transition-colors"
              >
                {CHAMBRE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeChambre(c.id)}
                className="w-8 h-8 rounded-md border border-white/10 hover:border-red-400 hover:text-red-400 text-fg-muted"
                aria-label="Retirer"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          onClick={addChambre}
          className="w-full py-2 rounded-md border border-dashed border-white/15 text-fg-muted hover:text-gold hover:border-gold transition-colors text-sm"
        >
          ＋ Ajouter une chambre
        </button>
      </Section>

      {/* Suite parentale */}
      <Section label="Suite parentale">
        <Toggle
          label="🛏️ Ajouter une suite parentale"
          checked={state.cfg_suite_parentale}
          onChange={(b) =>
            patch({
              cfg_suite_parentale: b,
              cfg_suite_parentale_type: b ? state.cfg_suite_parentale_type || "placard" : null,
            })
          }
        />
        <AnimatePresence>
          {state.cfg_suite_parentale && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              {[
                {
                  id: "dressing" as const,
                  icon: "👔",
                  title: "Chambre + Salle d'eau + Dressing",
                  sub: "Suite complète avec dressing séparé",
                },
                {
                  id: "placard" as const,
                  icon: "🗄️",
                  title: "Chambre + Placard + Salle d'eau",
                  sub: "Suite avec placard intégré",
                },
              ].map((opt) => {
                const selected = state.cfg_suite_parentale_type === opt.id;
                return (
                  <motion.button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ cfg_suite_parentale_type: opt.id })}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className={clsx(
                      "p-3 rounded-md border text-left flex items-start gap-3 transition-colors",
                      selected
                        ? "border-gold bg-gold/5"
                        : "border-white/10 hover:border-gold-dim"
                    )}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <div>
                      <strong
                        className={clsx("block text-sm", selected && "text-gold")}
                      >
                        {opt.title}
                      </strong>
                      <small className="text-xs text-fg-muted">{opt.sub}</small>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* Salles d'eau + pièces annexes */}
      <Section label="Espaces d'eau & pièces annexes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <CounterField
            label="Salles de bain privatives"
            value={state.cfg_salles_bain}
            min={0}
            max={8}
            onChange={(v) => patch({ cfg_salles_bain: v })}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Toggle
            label="💼 Bureau"
            checked={state.cfg_bureau}
            onChange={(b) => patch({ cfg_bureau: b })}
          />
          <Toggle
            label="🏋️ Sport"
            checked={state.cfg_sport}
            onChange={(b) => patch({ cfg_sport: b })}
          />
          <Toggle
            label="🧺 Buanderie"
            checked={state.cfg_buanderie}
            onChange={(b) => patch({ cfg_buanderie: b })}
          />
          <Toggle
            label="🗄️ Cellier"
            checked={state.cfg_cellier}
            onChange={(b) => patch({ cfg_cellier: b })}
          />
        </div>
      </Section>

      {/* Extérieurs */}
      <Section label="Extérieurs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
