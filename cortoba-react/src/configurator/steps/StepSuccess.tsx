import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useConfigurator } from "../context";

export function StepSuccess() {
  const { state, dispatch, goTo } = useConfigurator();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center py-16"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 220,
          damping: 16,
          delay: 0.15,
        }}
        className="text-6xl mb-6"
      >
        ✓
      </motion.div>
      <h2 className="font-serif text-3xl md:text-5xl font-light text-fg mb-4">
        Demande envoyée
      </h2>
      <p className="text-gold italic mb-2">
        « {state.cfg_nom_projet} »
      </p>
      <p className="text-fg-muted max-w-xl mx-auto mb-10 leading-relaxed">
        Merci ! Nous avons bien reçu votre demande. Un architecte vous contacte dans les
        48 heures pour affiner votre projet et vous présenter une première estimation.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="cta-button">
          ← Retour à l'accueil
        </Link>
        <button
          onClick={() => {
            dispatch({ type: "RESET" });
            goTo(1);
          }}
          className="cta-button cta-button-primary"
        >
          ↻ Nouveau projet
        </button>
      </div>
    </motion.div>
  );
}
