import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";

interface Service {
  title: string;
  lines: string[];
}

const SERVICES: Service[] = [
  {
    title: "Conception architecturale",
    lines: ["Études architecturales en 2D et 3D", "Dossier d'exécution détaillé"],
  },
  {
    title: "Assistance immobilière",
    lines: [
      "Accompagnement à la vente et l'achat de votre bien immobilier",
      "Études de faisabilité et de rentabilité",
    ],
  },
  {
    title: "Design intérieur",
    lines: ["Aménagement d'espaces, simulation 3D et choix des matériaux."],
  },
  {
    title: "Suivi et gestion de chantier",
    lines: [
      "Accompagnement complet comprenant le contrôle technique et financier en passant par le choix des entreprises.",
    ],
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="py-20 px-6">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        className="section-h2 text-center mb-4"
      >
        Nos Services
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="intro-text text-center mx-auto mb-12"
      >
        Une expertise sur mesure pour sublimer chaque projet.
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {SERVICES.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.7,
              delay: i * 0.12,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            whileHover={{ y: -4, borderColor: "rgba(200,169,110,0.5)" }}
            className="p-8 bg-bg-card border border-white/5 rounded-md"
          >
            <h3 className="text-sm tracking-[0.12em] uppercase font-semibold text-fg mb-4">
              {s.title}
            </h3>
            {s.lines.map((line) => (
              <p key={line} className="text-fg-muted text-sm leading-relaxed mb-2">
                {line}
              </p>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
