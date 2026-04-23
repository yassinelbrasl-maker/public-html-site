import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  fetchPublishedProjects,
  parseHeroPosition,
  type Project,
} from "@/api/projects";
import { Lightbox } from "@/components/Lightbox";
import { Seo } from "@/seo/Seo";

export function ProjectDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [all, setAll] = useState<Project[] | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    fetchPublishedProjects()
      .then(setAll)
      .catch(() => setAll([]));
    // Scroll to top on slug change
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  // Loading state
  if (all === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-fg-muted text-sm">Chargement…</div>
      </div>
    );
  }

  const project = all.find((p) => p.slug === slug);
  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-6 px-6">
        <h1 className="font-serif text-4xl text-fg">Projet introuvable</h1>
        <p className="text-fg-muted">Ce projet n'existe pas ou a été retiré.</p>
        <Link to="/" className="cta-button cta-button-primary">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  const heroPos = parseHeroPosition(project.hero_position);
  const galleryImages = (project.gallery_images || []).filter(Boolean);
  const allImages = [project.hero_image, ...galleryImages].filter(Boolean);
  const otherProjects = all.filter((p) => p.slug !== slug).slice(0, 3);
  const nextProject = all[(all.findIndex((p) => p.slug === slug) + 1) % all.length];

  return (
    <>
      <Seo
        title={project.title}
        description={
          project.description
            ? project.description.slice(0, 160)
            : `${project.category} — ${project.title}, ${project.location}${
                project.country ? ", " + project.country : ""
              }. Projet Cortoba Architecture Studio.`
        }
        image={project.hero_image}
        url={`/projet-${project.slug}`}
        type="article"
      />
      {/* Hero image */}
      <motion.section
        key={project.slug}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative h-[70vh] overflow-hidden bg-bg-elev"
      >
        <motion.img
          src={project.hero_image}
          alt={project.title}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
          style={{ objectPosition: `${heroPos.x}% ${heroPos.y}%` }}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={() => setLightboxIdx(0)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="absolute bottom-0 left-0 right-0 p-8 md:p-14 pointer-events-none"
        >
          <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-3">
            {project.category}
          </p>
          <h1 className="font-serif text-4xl md:text-6xl text-white font-light">
            {project.title}
          </h1>
          <p className="text-fg-muted mt-3 text-sm md:text-base">
            {project.location}
            {project.country && `, ${project.country}`}
            {project.year && ` · ${project.year}`}
          </p>
        </motion.div>
      </motion.section>

      {/* Description + meta */}
      <section className="py-20 px-6 md:px-16 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-10"
        >
          <div className="lg:col-span-2 space-y-5 text-fg-muted leading-relaxed">
            {project.description ? (
              <p>{project.description}</p>
            ) : (
              <p>
                Projet architectural sur mesure réalisé par Cortoba Architecture Studio.
                Étude de site, conception, dossier d'exécution et suivi de chantier
                jusqu'à la remise des clés.
              </p>
            )}
          </div>
          <div className="space-y-4 text-sm">
            {project.surface && (
              <MetaRow label="Surface" value={String(project.surface)} />
            )}
            {project.year && <MetaRow label="Année" value={String(project.year)} />}
            <MetaRow label="Catégorie" value={project.category} />
            <MetaRow
              label="Lieu"
              value={`${project.location}${project.country ? `, ${project.country}` : ""}`}
            />
          </div>
        </motion.div>
      </section>

      {/* Gallery */}
      {galleryImages.length > 0 && (
        <section className="py-10 px-6 md:px-16 bg-bg-alt">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-7xl mx-auto">
            {galleryImages.map((img, i) => (
              <motion.button
                key={img + i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.06 }}
                whileHover={{ y: -3 }}
                onClick={() => setLightboxIdx(i + 1)}
                className="block aspect-[4/3] overflow-hidden rounded-sm bg-bg-elev cursor-zoom-in"
              >
                <img
                  src={img}
                  alt={`${project.title} — image ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                />
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Other projects */}
      <section className="py-24 px-6 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <h2 className="font-serif text-3xl md:text-4xl font-light">
              Autres projets
            </h2>
            <Link
              to="/#projects"
              className="text-xs uppercase tracking-[0.2em] text-fg-muted hover:text-gold"
            >
              Voir tous les projets →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {otherProjects.map((p, i) => (
              <motion.div
                key={p.slug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <Link
                  to={`/projet-${p.slug}`}
                  className="block aspect-[4/3] overflow-hidden rounded-sm relative group"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${p.hero_image}')` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-[0.6rem] tracking-[0.22em] text-gold uppercase">
                      {p.category}
                    </p>
                    <h3 className="font-serif text-xl text-white mt-1">{p.title}</h3>
                    <p className="text-xs text-white/60 mt-1">
                      {p.location}
                      {p.country && `, ${p.country}`}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Next project CTA */}
      {nextProject && nextProject.slug !== slug && (
        <section className="py-20 px-6 bg-bg-alt border-t border-white/5">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-fg-muted uppercase tracking-[0.25em] mb-3">
              Projet suivant
            </p>
            <button
              onClick={() => navigate(`/projet-${nextProject.slug}`)}
              className="font-serif text-3xl md:text-5xl font-light text-fg hover:text-gold transition-colors"
            >
              {nextProject.title} →
            </button>
          </div>
        </section>
      )}

      <Lightbox
        images={allImages}
        index={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onNavigate={setLightboxIdx}
      />
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 pb-3 border-b border-white/5">
      <span className="text-fg-muted text-xs uppercase tracking-[0.15em]">{label}</span>
      <span className="text-fg text-right">{value}</span>
    </div>
  );
}
