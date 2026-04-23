import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Localisation du studio. On garde l'embed Google Maps (plus léger et plus
 * fiable que react-leaflet pour un simple "où nous sommes", et l'utilisateur
 * peut ouvrir Google Maps directement avec les directions).
 */
export function MapSection() {
  const { t } = useI18n();
  const mapEmbedSrc =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3932.5934013895326!2d10.986050799999997!3d33.804753999999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x13aa9779f4ac460b%3A0x95f2918c9f396d68!2sCortoba%20Architecture%20Studio!5e1!3m2!1sfr!2stn!4v1769655382963!5m2!1sfr!2stn";

  return (
    <section id="map" className="py-20 px-6 bg-bg-alt">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        className="section-h2 text-center mb-4"
      >
        📍 <span>{t("map_title")}</span>
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="intro-text text-center mx-auto mb-8"
      >
        {t("map_intro")}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, delay: 0.2 }}
        className="max-w-5xl mx-auto"
      >
        <div className="aspect-video overflow-hidden rounded-md border border-white/10">
          <iframe
            src={mapEmbedSrc}
            title="Localisation de Cortoba Architecture Studio sur Google Maps"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-full"
          />
        </div>
        <div className="mt-6 text-center">
          <a
            href="https://www.google.com/maps/dir/?api=1&destination=33.804754,10.9860508"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="10" r="3" />
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            Ouvrir dans Google Maps
            <span aria-hidden>↗</span>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
