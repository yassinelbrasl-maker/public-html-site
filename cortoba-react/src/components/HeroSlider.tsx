import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider";

const FALLBACK_SLIDES = [
  { src: "/img/Projets/p3.jpg", alt: "Projet résidentiel Cortoba" },
  { src: "/img/Projets/p5.jpg", alt: "Façade contemporaine" },
  { src: "/img/Projets/p1.jpg", alt: "Design méditerranéen" },
];

const AUTO_ADVANCE_MS = 5000;

export function HeroSlider() {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const slides = FALLBACK_SLIDES;

  useEffect(() => {
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <section className="relative h-screen overflow-hidden" id="accueil">
      {/* Slider background */}
      <AnimatePresence>
        <motion.img
          key={slides[current].src}
          src={slides[current].src}
          alt={slides[current].alt}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "50% 40%" }}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
        />
      </AnimatePresence>

      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70 pointer-events-none" />

      {/* Hero content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
        <motion.h1
          initial={{ opacity: 0, y: 20, letterSpacing: "0.1em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.2em" }}
          transition={{ duration: 1.6, delay: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          className="font-serif text-4xl md:text-6xl lg:text-7xl font-light tracking-widest text-white uppercase"
        >
          Cortoba Architecture Studio
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.0, ease: [0.22, 0.61, 0.36, 1] }}
          className="mt-6 text-fg-muted max-w-xl text-sm md:text-base"
        >
          Des projets qui racontent le lieu, la lumière et les gestes du quotidien.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.4, ease: [0.22, 0.61, 0.36, 1] }}
          className="mt-10 flex flex-wrap justify-center gap-4"
        >
          <a href="#projects" className="cta-button cta-button-primary">
            Voir nos projets
            <span aria-hidden>→</span>
          </a>
          <Link to="/configurateur" className="cta-button">
            Configurateur de projet
            <span aria-hidden>→</span>
          </Link>
        </motion.div>
      </div>

      {/* Slider indicator dots */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === current ? "bg-gold w-8" : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
