import { motion } from "framer-motion";

export function AboutSection() {
  return (
    <section id="about" className="py-20 px-6">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        className="section-h2 text-center mb-12"
      >
        À propos
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto items-center"
      >
        <div className="space-y-6 text-fg-muted text-sm md:text-base leading-relaxed">
          <p>
            Fondé par Amal Cortoba et Yassine Mestiri, Cortoba Architecture Studio est né
            de la rencontre entre l'architecture méditerranéenne intemporelle et les lignes
            contemporaines. Tous deux diplômés en HQE (Haute Qualité Environnementale),
            nous défendons une architecture durable qui dialogue avec son environnement
            sans sacrifier le confort moderne absolu.
          </p>
          <p>
            Basés à Djerba Midoun, nous puisons notre inspiration dans le patrimoine local
            pour concevoir des espaces uniques et baignés de lumière. Notre expertise
            rayonne sur toute l'île (Midoun, Houmt Souk, Ajim), s'étend au niveau national
            (Sousse, Tunis, Nabeul) et traverse les frontières pour des projets
            internationaux (France, Côte d'Ivoire, Gabon, Maroc).
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, delay: 0.3 }}
          className="overflow-hidden rounded-md"
        >
          <img
            src="/img/IMG_5524.JPG"
            alt="Portrait des fondateurs du studio Cortoba à Djerba"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
