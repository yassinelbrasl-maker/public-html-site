import { motion } from "framer-motion";
import { useConfigurator } from "../context";
import { StepNav } from "../StepNav";
import { StepHeading } from "./_shared";

export function Step1Projet() {
  const { state, dispatch, error } = useConfigurator();

  return (
    <>
      <StepHeading num="01" title="Comment s'appelle votre projet ?">
        Donnez un nom à votre projet. Ce sera votre référence tout au long du processus.
      </StepHeading>

      <motion.input
        type="text"
        placeholder="Ex : Villa Djerba, Résidence Les Oliviers…"
        value={state.cfg_nom_projet}
        onChange={(e) =>
          dispatch({ type: "SET", key: "cfg_nom_projet", value: e.target.value })
        }
        className="w-full bg-bg-card border border-white/10 rounded-md px-5 py-4 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors text-lg"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        autoFocus
      />

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-sm text-red-400"
        >
          ⚠ {error}
        </motion.p>
      )}

      <StepNav nextLabel="Commencer →" />
    </>
  );
}
