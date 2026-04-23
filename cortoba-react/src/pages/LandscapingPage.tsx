import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import { Seo } from "@/seo/Seo";

/**
 * Landscaping — Cortoba paysagisme
 *
 * Portage complet de landscaping.html. On récupère :
 *  - La chorégraphie d'intro (via framer-motion variants + staggerChildren)
 *  - Un parallax subtil sur le hero (useScroll + useSpring)
 *  - Les sections : Manifeste, Projets, Services, Philosophie, Approche, Contact
 */

const HERO_SLIDES = [
  "/img/landscaping/hero1.jpg",
  "/img/landscaping/hero2.jpg",
  "/img/landscaping/hero3.jpg",
];

export function LandscapingPage() {
  return (
    <>
      <Hero />
      <Manifeste />
      <Projects />
      <Services />
      <Philosophy />
      <Approach />
      <Contact />
    </>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 20 });
  const yBg = useTransform(smooth, [0, 1], ["0%", "20%"]);

  return (
    <section
      ref={ref}
      className="relative h-screen overflow-hidden flex flex-col justify-center px-6 md:px-16"
    >
      <motion.div
        className="absolute inset-0"
        style={{ y: yBg }}
      >
        <img
          src={HERO_SLIDES[0]}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
      </motion.div>

      <motion.div
        className="relative z-10 max-w-xl"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.2, delayChildren: 0.3 } },
        }}
      >
        <motion.p
          variants={fadeUp}
          className="text-[0.65rem] tracking-[0.38em] uppercase text-gold mb-6 flex items-center gap-4"
        >
          <span className="inline-block w-10 h-px bg-gold" />
          Architecture du paysage
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="font-serif text-5xl md:text-7xl font-light text-white leading-[1.05]"
        >
          Jardins<br />qui<br />
          <em className="text-gold not-italic italic">respirent</em>
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="mt-8 text-white/60 max-w-md leading-relaxed text-sm md:text-base"
        >
          Chaque espace extérieur est une invitation à lire le sol, la lumière et le vent.
          Nous concevons des paysages vivants, ancrés dans leur territoire.
        </motion.p>
        <motion.a
          variants={fadeUp}
          href="#projets"
          className="inline-flex items-center gap-4 mt-10 text-white text-xs tracking-[0.22em] uppercase border-b border-white/30 pb-2 hover:text-gold hover:border-gold transition-colors"
        >
          Découvrir nos projets
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </motion.a>
      </motion.div>
    </section>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.22, 0.61, 0.36, 1] },
  },
};

function Manifeste() {
  return (
    <section id="about" className="py-28 px-6 md:px-16 bg-bg">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
          className="lg:col-span-3"
        >
          <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-6">
            Notre manifeste
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-light leading-tight mb-8">
            Le paysage comme<br />
            <em className="text-gold not-italic italic">langage premier</em>
          </h2>
          <div className="space-y-5 text-fg-muted leading-relaxed max-w-2xl">
            <p>
              Chez Cortoba Landscaping, nous croyons que le jardin n'est pas un décor —
              c'est un milieu de vie. Une extension naturelle de l'architecture, un espace
              où la végétation méditerranéenne dialogue avec les pierres et l'eau.
            </p>
            <p>
              Chaque projet commence par une écoute du sol, une lecture du climat local et
              une compréhension des usages. Nous composons des espaces qui évoluent avec
              les saisons, se bonifient avec le temps.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15 } },
          }}
          className="lg:col-span-2 space-y-8"
        >
          {[
            { num: "40", suffix: "+", label: "Jardins réalisés en Méditerranée" },
            { num: "15", suffix: " ans", label: "D'expertise paysagère" },
            { num: "3", suffix: " pays", label: "Tunisie · France · Italie" },
          ].map((s) => (
            <motion.div key={s.label} variants={fadeUp}>
              <div className="font-serif text-5xl text-gold font-light">
                {s.num}
                <em className="text-2xl not-italic">{s.suffix}</em>
              </div>
              <div className="text-xs text-fg-muted uppercase tracking-[0.15em] mt-2">
                {s.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Projects() {
  const items = [
    { tag: "Jardin privé", name: "Villa Oléa", loc: "Djerba, Tunisie", img: "/img/landscaping/proj1.jpg" },
    { tag: "Terrasse", name: "Riad Jasmin", loc: "Tunis", img: "/img/landscaping/proj2.jpg" },
    { tag: "Hôtellerie", name: "Domaine Sirocco", loc: "Hammamet", img: "/img/landscaping/proj3.jpg" },
    { tag: "Espace public", name: "Promenade Côtière", loc: "Zarzis", img: "/img/landscaping/proj4.jpg" },
    { tag: "Résidentiel", name: "Les Jardins de l'Atlas", loc: "Tunis", img: "/img/landscaping/proj5.jpg" },
  ];
  return (
    <section id="projets" className="py-28 px-6 md:px-16 bg-bg-alt">
      <div className="flex flex-wrap items-end justify-between gap-6 max-w-7xl mx-auto mb-12">
        <div>
          <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-2">Portfolio</p>
          <h2 className="font-serif text-4xl md:text-5xl font-light">Projets récents</h2>
        </div>
        <a
          href="#contact"
          className="text-xs text-fg uppercase tracking-[0.22em] inline-flex items-center gap-2 hover:text-gold transition-colors"
        >
          Tous les projets
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
        {items.map((p, i) => (
          <motion.a
            key={p.name}
            href="#"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: i * 0.08 }}
            whileHover={{ y: -4 }}
            className="relative group aspect-[4/5] overflow-hidden rounded-sm block"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url('${p.img}')` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-[0.65rem] tracking-[0.25em] text-gold uppercase">{p.tag}</p>
              <h3 className="font-serif text-2xl text-white mt-1">{p.name}</h3>
              <p className="text-xs text-white/60 mt-1">{p.loc}</p>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}

function Services() {
  const list = [
    { title: "Conception de jardins", desc: "De la villa privée au grand domaine, nous dessinons des espaces végétaux cohérents avec l'architecture et le mode de vie de chaque client." },
    { title: "Terrasses & Patios", desc: "Espaces de transition entre intérieur et extérieur, conçus pour les usages méditerranéens : ombre, eau, minéral et végétal en équilibre." },
    { title: "Éclairage paysager", desc: "L'ambiance nocturne d'un jardin se pense dès la conception. Nous intégrons l'éclairage comme une partition lumineuse qui révèle les volumes végétaux." },
    { title: "Végétation autochtone", desc: "Olivier, figuier, romarin, tamaris — nous privilégions les espèces du bassin méditerranéen, adaptées au sol et au climat local, pour des jardins résilients." },
    { title: "Gestion de l'eau", desc: "Irrigation intégrée, récupération des eaux pluviales, bassins et canaux : chaque projet intègre une approche raisonnée de la ressource hydrique." },
    { title: "Suivi & Entretien", desc: "Un jardin bien né mérite un accompagnement pérenne. Nous proposons des contrats d'entretien saisonniers assurés par nos équipes spécialisées." },
  ];
  return (
    <section id="services" className="py-28 px-6 md:px-16">
      <div className="max-w-7xl mx-auto">
        <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-2">Expertises</p>
        <h2 className="font-serif text-4xl md:text-5xl font-light mb-12">Ce que nous créons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="bg-bg-card border border-white/5 rounded-md p-8 hover:border-gold-dim transition-colors"
            >
              <h3 className="text-sm tracking-[0.12em] uppercase font-semibold text-fg mb-3">
                {s.title}
              </h3>
              <p className="text-fg-muted text-sm leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Philosophy() {
  return (
    <section className="relative py-40 px-6 overflow-hidden bg-bg-alt">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1.2 }}
        className="max-w-4xl mx-auto text-center"
      >
        <blockquote className="font-serif text-3xl md:text-5xl font-light leading-snug text-fg">
          « Le jardin est le lieu où l'on apprend à regarder<br />
          la lenteur comme une <em className="text-gold not-italic italic">vertu</em>. »
        </blockquote>
        <p className="mt-8 text-xs text-fg-muted tracking-[0.22em] uppercase">
          Cortoba Landscaping · Philosophie du Studio
        </p>
      </motion.div>
    </section>
  );
}

function Approach() {
  const steps = [
    { n: "01", t: "Écoute & Analyse du site", d: "Nous commençons toujours par une visite approfondie — lecture du sol, orientation, vents dominants, existant végétal et usages souhaités." },
    { n: "02", t: "Esquisse & Concept", d: "Une planche de composition présente le parti pris paysager, la palette végétale, les matériaux et les axes de circulation." },
    { n: "03", t: "Plan d'exécution", d: "Plans techniques détaillés pour chaque corps de métier : terrassement, maçonnerie paysagère, plantation, irrigation, éclairage." },
    { n: "04", t: "Réalisation & Suivi chantier", d: "Présence régulière sur site, coordination des équipes et contrôle qualité jusqu'à la livraison et la première pousse." },
  ];
  return (
    <section id="approche" className="py-28 px-6 md:px-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-2">Processus</p>
        <h2 className="font-serif text-4xl md:text-5xl font-light mb-14">
          Notre approche<br />
          <em className="text-gold not-italic italic">de projet</em>
        </h2>
        <div className="space-y-10">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="flex gap-6"
            >
              <div className="font-serif text-4xl text-gold-dim font-light shrink-0">{s.n}</div>
              <div>
                <h3 className="text-base font-semibold text-fg mb-2">{s.t}</h3>
                <p className="text-fg-muted text-sm leading-relaxed max-w-xl">{s.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-32 px-6 bg-bg-alt">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9 }}
        className="max-w-3xl mx-auto text-center"
      >
        <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-4">
          Parlez-nous de votre projet
        </p>
        <h2 className="font-serif text-4xl md:text-6xl font-light leading-tight mb-6">
          Un jardin<br />
          <em className="text-gold not-italic italic">à imaginer ensemble</em>
        </h2>
        <p className="text-fg-muted text-base leading-relaxed mb-10 max-w-xl mx-auto">
          De la terrasse intime au grand parc, chaque projet mérite une conversation.
          Contactez-nous pour une première rencontre sur site — sans engagement.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href="mailto:paysage@cortobaarchitecture.com" className="cta-button cta-button-primary">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Écrire au studio
          </a>
          <a
            href="https://wa.me/21629401234"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-button"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </motion.div>
    </section>
  );
}
