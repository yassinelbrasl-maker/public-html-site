import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fetchPublicTeam, type TeamMember, initialsFor, fullName } from "@/api/users";
import { useI18n } from "@/i18n/I18nProvider";

export function TeamSection() {
  const { t } = useI18n();
  const [members, setMembers] = useState<TeamMember[] | null>(null);

  useEffect(() => {
    fetchPublicTeam()
      .then(setMembers)
      .catch(() => setMembers([])); // empty → section stays hidden
  }, []);

  // Ne pas afficher si l'API est injoignable (comportement du vanilla legacy)
  if (!members || members.length === 0) return null;

  return (
    <section id="team" className="py-20 px-6 bg-bg-alt">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        className="section-h2 text-center mb-12"
      >
        Notre Équipe
      </motion.h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {members.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.7,
              delay: i * 0.1,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            whileHover={{ y: -4 }}
            className="flex flex-col items-center text-center gap-3"
          >
            {m.profile_picture_url ? (
              <img
                src={m.profile_picture_url}
                alt={fullName(m)}
                loading="lazy"
                className="w-32 h-32 rounded-full object-cover border border-gold-dim"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-bg-card border border-gold-dim flex items-center justify-center text-3xl font-serif text-gold">
                {initialsFor(m)}
              </div>
            )}
            <h3 className="font-serif text-lg text-fg">{fullName(m)}</h3>
            {(m.role || m.spec) && (
              <p className="text-xs text-fg-muted uppercase tracking-wider">
                {m.role || m.spec}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
