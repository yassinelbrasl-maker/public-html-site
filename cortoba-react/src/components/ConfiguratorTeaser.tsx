import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider";

export function ConfiguratorTeaser() {
  const { t } = useI18n();
  return (
    <section className="relative py-32 px-6 text-center overflow-hidden" style={{ background: "#0e0e0e" }}>
      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.1em" }}
        whileInView={{ opacity: 1, letterSpacing: "0.35em" }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="text-xs text-gold uppercase mb-4"
      >
        {t("config_label")}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.15 }}
        className="font-serif text-5xl md:text-6xl font-light"
      >
        {t("config_title_part1")}{" "}
        <em className="text-gold">{t("config_title_part2")}</em>
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.3 }}
        className="intro-text mx-auto mt-6 mb-10"
      >
        {t("config_intro")}
      </motion.p>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.45 }}
      >
        <Link to="/configurateur" className="cta-button cta-button-primary">
          {t("config_cta")} →
        </Link>
      </motion.div>
    </section>
  );
}
