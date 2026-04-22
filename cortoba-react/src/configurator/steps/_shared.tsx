import { ReactNode } from "react";
import { motion } from "framer-motion";

export function StepHeading({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 pb-6 border-b border-white/5 relative">
      <div className="absolute -top-2 right-0 font-serif text-[5rem] font-thin text-white/5 leading-none pointer-events-none">
        {num}
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-serif text-3xl md:text-4xl font-light text-fg"
      >
        {title}
      </motion.h2>
      {children && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-3 text-sm text-fg-muted max-w-2xl leading-relaxed"
        >
          {children}
        </motion.p>
      )}
    </div>
  );
}

/**
 * Placeholder utilisé pour les steps complexes pas encore intégralement portés
 * (cfg_missions, cfg_type/operation, cfg_style/standing, cfg_programme, cfg_terrain).
 * Affiche un petit message + permet quand même d'avancer/reculer dans le flow.
 */
export function StepPlaceholder({
  num,
  title,
  description,
  todoItems,
}: {
  num: string;
  title: string;
  description: string;
  todoItems: string[];
}) {
  return (
    <>
      <StepHeading num={num} title={title}>
        {description}
      </StepHeading>
      <div className="p-6 bg-bg-card border border-gold-dim rounded-md">
        <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-4">
          Étape à terminer — fonctionnalités du legacy
        </p>
        <ul className="space-y-2 text-sm text-fg-muted">
          {todoItems.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="text-gold">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-fg-muted italic">
          Voir l'original <code className="bg-black/30 px-1">configurateur.html</code> —
          les fonctions <code>cfgSelect</code>, <code>cfgRenderMissions</code>,
          <code>cfgUpdateProgramme</code>, etc.
        </p>
      </div>
    </>
  );
}
