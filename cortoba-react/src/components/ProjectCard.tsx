import { motion } from "framer-motion";
import { type Project } from "@/api/projects";
import clsx from "clsx";

interface Props {
  project: Project;
  position: { x: number; y: number };
  index: number;
  onClick: () => void;
}

const gridClassMap: Record<string, string> = {
  big: "md:col-span-2 md:row-span-2",
  wide: "md:col-span-2",
  tall: "md:row-span-2",
  full: "md:col-span-3",
  "": "",
};

export function ProjectCard({ project, position, index, onClick }: Props) {
  return (
    <motion.a
      layoutId={`card-${project.slug}`}
      href={`/projet-${project.slug}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        onClick();
      }}
      className={clsx(
        "relative block overflow-hidden cursor-pointer group",
        gridClassMap[project.grid_class || ""]
      )}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.7,
        delay: index * 0.08,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      whileHover={{ y: -4 }}
    >
      <motion.div
        layoutId={`img-${project.slug}`}
        className="w-full h-full bg-cover transition-transform duration-500 group-hover:scale-105"
        style={{
          backgroundImage: `url('${project.hero_image}')`,
          backgroundPosition: `${position.x}% ${position.y}%`,
        }}
      />
      <motion.div
        layoutId={`meta-${project.slug}`}
        className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
      >
        <p className="text-[0.65rem] tracking-[0.2em] text-gold uppercase">
          {project.category}
        </p>
        <h3 className="font-serif text-2xl text-white font-light mt-1">
          {project.title}
        </h3>
        <p className="text-xs text-fg-muted mt-1">
          {project.location}
          {project.country && `, ${project.country}`}
        </p>
      </motion.div>
    </motion.a>
  );
}
