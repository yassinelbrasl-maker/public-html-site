import { motion } from "framer-motion";

export function PlaceholderSection({
  title,
  icon,
  description,
}: {
  title: string;
  icon: string;
  description: string;
}) {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3 mb-6"
      >
        <span className="text-3xl">{icon}</span>
        <h1 className="font-serif text-3xl font-light text-fg">{title}</h1>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="p-6 bg-bg-card border border-gold-dim/40 rounded-md max-w-3xl"
      >
        <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-3">
          Section à terminer
        </p>
        <p className="text-sm text-fg-muted leading-relaxed">{description}</p>
        <p className="mt-4 text-xs text-fg-muted italic">
          Voir <code className="bg-black/30 px-1">settings.html</code> dans le legacy
          pour les champs et la logique à porter.
        </p>
      </motion.div>
    </div>
  );
}
