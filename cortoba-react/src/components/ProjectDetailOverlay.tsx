import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { type Project } from "@/api/projects";

interface Props {
  project: Project;
  onClose: () => void;
}

/**
 * Morph from the grid card → large centered detail view using layoutId.
 * This is the signature framer-motion React feature that islands-mode can only approximate.
 */
export function ProjectDetailOverlay({ project, onClose }: Props) {
  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Morphing card */}
      <motion.div
        layoutId={`card-${project.slug}`}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-auto bg-bg-card rounded-xl border border-white/10 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          layoutId={`img-${project.slug}`}
          className="w-full aspect-[16/7] bg-cover bg-center"
          style={{ backgroundImage: `url('${project.hero_image}')` }}
        />
        <div className="p-8 md:p-10">
          <motion.div layoutId={`meta-${project.slug}`}>
            <p className="text-[0.7rem] tracking-[0.25em] text-gold uppercase">
              {project.category}
            </p>
            <h3 className="font-serif text-3xl md:text-4xl text-white font-light mt-2">
              {project.title}
            </h3>
            <p className="text-sm text-fg-muted mt-2">
              {project.location}
              {project.country && `, ${project.country}`}
            </p>
          </motion.div>
          <p className="text-fg-muted mt-6 leading-relaxed max-w-prose">
            Projet architectural sur mesure. Étude de site, conception, suivi de chantier et
            livraison clé en main. Nos équipes interviennent sur l'ensemble du cycle du
            projet, de la première esquisse à la remise des clés.
          </p>
          <div className="mt-8 flex gap-4">
            <Link
              to={`/projet-${project.slug}`}
              className="cta-button cta-button-primary"
              onClick={onClose}
            >
              Voir le projet complet →
            </Link>
            <button onClick={onClose} className="cta-button">
              Fermer
            </button>
          </div>
        </div>
      </motion.div>

      {/* Close button */}
      <motion.button
        onClick={onClose}
        className="fixed top-6 right-6 w-11 h-11 rounded-full bg-bg-elev border border-white/15 text-fg hover:border-gold hover:text-gold flex items-center justify-center text-xl"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2, delay: 0.15 }}
        aria-label="Fermer"
      >
        ×
      </motion.button>
    </motion.div>
  );
}
