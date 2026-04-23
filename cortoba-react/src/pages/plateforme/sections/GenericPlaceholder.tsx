import { motion } from "framer-motion";

export function GenericPlaceholder({
  title,
  icon,
  description,
  endpoints,
}: {
  title: string;
  icon: string;
  description: string;
  endpoints: string[];
}) {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <span className="text-3xl">{icon}</span>
        <h1 className="font-serif text-3xl font-light text-fg">{title}</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-6 bg-bg-card border border-gold-dim/30 rounded-md max-w-3xl"
      >
        <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-3">
          Section à porter
        </p>
        <p className="text-sm text-fg-muted leading-relaxed">{description}</p>
        <p className="mt-4 text-xs text-fg-muted uppercase tracking-wider">
          Endpoints PHP à consommer
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {endpoints.map((e) => (
            <li key={e}>
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-gold/80">
                {e}
              </code>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-fg-muted italic">
          Voir <code className="bg-black/30 px-1">plateforme-nas.html</code> +{" "}
          <code className="bg-black/30 px-1">plateforme-nas.js</code> dans le legacy
          pour la logique à porter.
        </p>
      </motion.div>
    </div>
  );
}
