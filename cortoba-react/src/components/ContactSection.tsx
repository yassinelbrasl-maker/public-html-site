import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";

type SubmitStatus = "idle" | "sending" | "success" | "error";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mbdzlnny";

export function ContactSection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SubmitStatus>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="contact" className="py-20 px-6">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        className="section-h2 text-center mb-4"
      >
        {t("contact_title")}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="intro-text text-center mx-auto mb-12"
      >
        {t("contact_intro")}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            name="nom"
            placeholder="Votre nom"
            required
            className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
          />
          <input
            type="email"
            name="email"
            placeholder="Votre email"
            required
            className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
          />
          <textarea
            name="message"
            rows={5}
            placeholder="Votre message"
            required
            className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors resize-none"
          />
          <input
            type="hidden"
            name="_subject"
            value="Nouveau message - Cortoba Architecture Studio"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="cta-button cta-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "sending" ? "Envoi..." : "Envoyer"}
          </button>
          {status === "success" && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-green-500 text-sm font-semibold"
            >
              ✅ Message envoyé avec succès ! Nous vous répondrons rapidement.
            </motion.p>
          )}
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-500 text-sm font-semibold"
            >
              ❌ Une erreur est survenue. Veuillez réessayer ou nous contacter par email.
            </motion.p>
          )}
        </form>

        <div className="space-y-4 text-fg-muted text-sm leading-relaxed">
          <p>
            <strong className="text-fg">Adresse :</strong> Immeuble Cortoba, 1er étage,
            Midoun, Djerba
          </p>
          <p>
            <strong className="text-fg">Téléphone :</strong>{" "}
            <a href="tel:+21694119120" className="text-gold hover:underline">
              +216 94 119 120
            </a>
            {" · "}
            <a href="tel:+21697254736" className="text-gold hover:underline">
              +216 97 254 736
            </a>
          </p>
          <p>
            <strong className="text-fg">Email :</strong>{" "}
            <a
              href="mailto:contact@cortobaarchitecture.com"
              className="text-gold hover:underline"
            >
              contact@cortobaarchitecture.com
            </a>
          </p>
        </div>
      </motion.div>
    </section>
  );
}
