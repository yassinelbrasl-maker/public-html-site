/**
 * Dictionnaires de traduction FR / EN / AR.
 * Contrat identique aux clés data-i18n de l'ancien site pour faciliter
 * la comparaison et l'ajout progressif.
 *
 * Note : on commence par les chaînes les plus visibles (hero, nav, CTA, sections).
 * Le reste des composants tombe en fallback FR pour l'instant — on ajoute les
 * clés au fil des besoins.
 */

export type Locale = "fr" | "en" | "ar";

export const LOCALES: Locale[] = ["fr", "en", "ar"];

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
  ar: "AR",
};

export const RTL_LOCALES: Locale[] = ["ar"];

export interface Dictionary {
  // Nav
  nav_landscaping: string;

  // Hero home
  hero_title: string;
  hero_subtitle: string;
  hero_cta_projects: string;
  hero_cta_configurator: string;

  // Sections
  projects_title: string;
  projects_intro: string;
  services_title: string;
  services_intro: string;
  about_title: string;
  team_title: string;
  contact_title: string;
  contact_intro: string;
  map_title: string;
  map_intro: string;
  map_open_gmaps: string;

  // Contact form
  form_name: string;
  form_email: string;
  form_message: string;
  form_send: string;
  form_success: string;
  form_error: string;

  // Configurator teaser
  config_label: string;
  config_title_part1: string;
  config_title_part2: string;
  config_intro: string;
  config_cta: string;

  // Common
  see_full_project: string;
  close: string;
  back_home: string;
  loading: string;
}

const fr: Dictionary = {
  nav_landscaping: "Landscaping",
  hero_title: "Cortoba Architecture Studio",
  hero_subtitle:
    "Des projets qui racontent le lieu, la lumière et les gestes du quotidien.",
  hero_cta_projects: "Voir nos projets",
  hero_cta_configurator: "Configurateur de projet",
  projects_title: "Projets",
  projects_intro: "Une sélection de réalisations qui définissent notre approche.",
  services_title: "Nos Services",
  services_intro: "Une expertise sur mesure pour sublimer chaque projet.",
  about_title: "À propos",
  team_title: "Notre Équipe",
  contact_title: "Contact",
  contact_intro: "Envie d'échanger ou de démarrer un projet ? Parlons-en.",
  map_title: "Localisation",
  map_intro:
    "Retrouvez-nous à Midoun, Djerba — en face du stade, Immeuble Cortoba, 1er étage.",
  map_open_gmaps: "Ouvrir dans Google Maps",
  form_name: "Votre nom",
  form_email: "Votre email",
  form_message: "Votre message",
  form_send: "Envoyer",
  form_success:
    "✅ Message envoyé avec succès ! Nous vous répondrons rapidement.",
  form_error:
    "❌ Une erreur est survenue. Veuillez réessayer ou nous contacter par email.",
  config_label: "Outil exclusif",
  config_title_part1: "Configurateur",
  config_title_part2: "de projet",
  config_intro:
    "Estimez la surface et le budget de votre futur projet en quelques clics. Notre moteur de calcul croise votre programme avec des ratios architecturaux pour vous donner une première fourchette réaliste.",
  config_cta: "Démarrer le configurateur",
  see_full_project: "Voir le projet complet",
  close: "Fermer",
  back_home: "Retour à l'accueil",
  loading: "Chargement…",
};

const en: Dictionary = {
  nav_landscaping: "Landscaping",
  hero_title: "Cortoba Architecture Studio",
  hero_subtitle:
    "Projects that tell the story of place, light, and everyday life.",
  hero_cta_projects: "See our projects",
  hero_cta_configurator: "Project configurator",
  projects_title: "Projects",
  projects_intro: "A selection of works that define our approach.",
  services_title: "Our Services",
  services_intro: "Tailored expertise to elevate every project.",
  about_title: "About",
  team_title: "Our Team",
  contact_title: "Contact",
  contact_intro: "Want to talk or start a project? Let's discuss.",
  map_title: "Location",
  map_intro:
    "Find us in Midoun, Djerba — across from the stadium, Cortoba Building, 1st floor.",
  map_open_gmaps: "Open in Google Maps",
  form_name: "Your name",
  form_email: "Your email",
  form_message: "Your message",
  form_send: "Send",
  form_success: "✅ Message sent successfully! We'll reply shortly.",
  form_error: "❌ An error occurred. Please try again or email us.",
  config_label: "Exclusive tool",
  config_title_part1: "Project",
  config_title_part2: "configurator",
  config_intro:
    "Estimate the area and budget of your future project in a few clicks. Our calculator combines your program with architectural ratios to give you a realistic first range.",
  config_cta: "Start the configurator",
  see_full_project: "See the full project",
  close: "Close",
  back_home: "Back to home",
  loading: "Loading…",
};

const ar: Dictionary = {
  nav_landscaping: "المساحات الخضراء",
  hero_title: "ستوديو قرطبة للعمارة",
  hero_subtitle:
    "مشاريع تحكي قصة المكان والضوء وحركات الحياة اليومية.",
  hero_cta_projects: "مشاريعنا",
  hero_cta_configurator: "مُخطّط المشروع",
  projects_title: "المشاريع",
  projects_intro: "مجموعة مختارة من الأعمال التي تحدد نهجنا.",
  services_title: "خدماتنا",
  services_intro: "خبرة مصممة خصيصاً لكل مشروع.",
  about_title: "من نحن",
  team_title: "فريقنا",
  contact_title: "تواصل معنا",
  contact_intro: "هل ترغب في الحديث أو بدء مشروع؟ لنتحدث.",
  map_title: "الموقع",
  map_intro:
    "تجدوننا في ميدون، جربة — مقابل الملعب، عمارة قرطبة، الطابق الأول.",
  map_open_gmaps: "افتح في خرائط جوجل",
  form_name: "اسمك",
  form_email: "بريدك الإلكتروني",
  form_message: "رسالتك",
  form_send: "إرسال",
  form_success: "✅ تم إرسال الرسالة بنجاح! سنرد عليك قريباً.",
  form_error: "❌ حدث خطأ. حاول مرة أخرى أو راسلنا عبر البريد.",
  config_label: "أداة حصرية",
  config_title_part1: "مُخطّط",
  config_title_part2: "المشروع",
  config_intro:
    "قدّر مساحة وميزانية مشروعك القادم في بضع نقرات. محرك الحساب لدينا يدمج برنامجك مع نسب معمارية لإعطائك تقديراً أولياً واقعياً.",
  config_cta: "ابدأ المخطط",
  see_full_project: "عرض المشروع الكامل",
  close: "إغلاق",
  back_home: "العودة إلى الصفحة الرئيسية",
  loading: "جاري التحميل…",
};

export const DICTIONARIES: Record<Locale, Dictionary> = { fr, en, ar };
