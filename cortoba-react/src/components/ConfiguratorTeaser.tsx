import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export function ConfiguratorTeaser() {
  return (
    <section className="relative py-32 px-6 text-center overflow-hidden" style={{ background: "#0e0e0e" }}>
      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.1em" }}
        whileInView={{ opacity: 1, letterSpacing: "0.35em" }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="text-xs text-gold uppercase mb-4"
      >
        Outil exclusif
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.15 }}
        className="font-serif text-5xl md:text-6xl font-light"
      >
        Configurateur <em className="text-gold">de projet</em>
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.3 }}
        className="intro-text mx-auto mt-6 mb-10"
      >
        Estimez la surface et le budget de votre futur projet en quelques clics. Notre
        moteur de calcul croise votre programme avec des ratios architecturaux pour vous
        donner une première fourchette réaliste.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.45 }}
      >
        <Link to="/configurateur" className="cta-button cta-button-primary">
          Démarrer le configurateur →
        </Link>
      </motion.div>
    </section>
  );
}
