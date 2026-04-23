import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPublishedProjects, parseHeroPosition, type Project } from "@/api/projects";
import { ProjectCard } from "./ProjectCard";
import { ProjectDetailOverlay } from "./ProjectDetailOverlay";
import { useI18n } from "@/i18n/I18nProvider";

const FALLBACK_PROJECTS: Project[] = [
  {
    slug: "villa-mediterranee",
    title: "Villa Méditerranée",
    category: "RÉSIDENTIEL",
    location: "Djerba",
    country: "Tunisie",
    hero_image: "/img/bg.jpg",
    hero_position: 50,
    grid_class: "big",
  },
  {
    slug: "atelier-studio",
    title: "Atelier Studio",
    category: "TERTIAIRE",
    location: "Midoun",
    country: "",
    hero_image: "/img/office.jpg",
    hero_position: 50,
    grid_class: "",
  },
  {
    slug: "maison-de-ville",
    title: "Maison de Ville",
    category: "RÉNOVATION",
    location: "Houmt Souk",
    country: "",
    hero_image: "/img/IMG_5524.JPG",
    hero_position: 50,
    grid_class: "",
  },
];

export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[]>(FALLBACK_PROJECTS);
  const [openProject, setOpenProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchPublishedProjects()
      .then((data) => {
        if (data.length > 0) setProjects(data);
      })
      .catch(() => {
        /* silently keep fallback */
      });
  }, []);

  return (
    <section id="projects" className="py-20 bg-bg-alt">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
        className="text-center mb-12 px-6"
      >
        <h2 className="section-h2 mb-4">Projets</h2>
        <p className="intro-text mx-auto">
          Une sélection de réalisations qui définissent notre approche.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 max-w-[1400px] mx-auto auto-rows-[380px]">
        {projects.map((p, i) => {
          const pos = parseHeroPosition(p.hero_position);
          return (
            <ProjectCard
              key={p.slug}
              project={p}
              position={pos}
              index={i}
              onClick={() => setOpenProject(p)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {openProject && (
          <ProjectDetailOverlay
            project={openProject}
            onClose={() => setOpenProject(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
