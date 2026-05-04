import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

type PageKey = "home" | "landscaping" | "configurateur";

interface PageSeo {
  title?: string;
  description?: string;
  og_image?: string;
  keywords?: string;
}

type SeoData = Record<PageKey, PageSeo>;

const PAGES: { key: PageKey; label: string }[] = [
  { key: "home", label: "Page d'accueil" },
  { key: "landscaping", label: "Landscaping" },
  { key: "configurateur", label: "Configurateur" },
];

/**
 * Settings → SEO & Méta.
 * Édition des meta tags par page. Lit/écrit /cortoba-plateforme/api/data.php
 * ?table=parametres (clés seo_home_*, seo_landscaping_*, etc.)
 */
export function SeoSection() {
  const [active, setActive] = useState<PageKey>("home");
  const [data, setData] = useState<SeoData>({
    home: {},
    landscaping: {},
    configurateur: {},
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/data.php?table=parametres")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} sur data.php?table=parametres`);
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          throw new Error("Réponse non-JSON depuis data.php");
        }
        return r.json();
      })
      .then((raw) => {
        if (raw.success === false) {
          throw new Error(raw.error || "Erreur serveur");
        }
        const d = raw.data || {};
        setData({
          home: {
            title: d.seo_home_title || "",
            description: d.seo_home_description || "",
            og_image: d.seo_home_og_image || "",
            keywords: d.seo_home_keywords || "",
          },
          landscaping: {
            title: d.seo_landscaping_title || "",
            description: d.seo_landscaping_description || "",
            og_image: d.seo_landscaping_og_image || "",
            keywords: d.seo_landscaping_keywords || "",
          },
          configurateur: {
            title: d.seo_configurateur_title || "",
            description: d.seo_configurateur_description || "",
            og_image: d.seo_configurateur_og_image || "",
            keywords: d.seo_configurateur_keywords || "",
          },
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function update(key: keyof PageSeo, value: string) {
    setData((d) => ({ ...d, [active]: { ...d[active], [key]: value } }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string | undefined> = {};
      for (const p of PAGES) {
        const v = data[p.key];
        payload[`seo_${p.key}_title`] = v.title;
        payload[`seo_${p.key}_description`] = v.description;
        payload[`seo_${p.key}_og_image`] = v.og_image;
        payload[`seo_${p.key}_keywords`] = v.keywords;
      }
      await apiFetch("/cortoba-plateforme/api/data.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert("Erreur : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  const cur = data[active];

  return (
    <div className="max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <span className="text-3xl">📈</span>
        <h1 className="font-serif text-3xl font-light text-fg">SEO & Méta</h1>
      </motion.div>

      {/* Tabs per page */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-white/5">
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setActive(p.key)}
            className={`px-4 py-2 text-xs tracking-wider uppercase transition-colors ${
              active === p.key
                ? "text-gold border-b-2 border-gold -mb-px"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <motion.form
        key={active}
        onSubmit={save}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        <Field
          label="Title"
          hint="Affiché dans l'onglet du navigateur et les résultats Google (~60 chars)"
          value={cur.title || ""}
          onChange={(e) => update("title", e.target.value)}
          maxLength={70}
        />
        <TextArea
          label="Description"
          hint="Meta description, aperçu Google (~150-160 chars)"
          value={cur.description || ""}
          onChange={(e) => update("description", e.target.value)}
          maxLength={180}
        />
        <Field
          label="OG Image URL"
          hint="Image de partage réseaux sociaux (1200×630 recommandé)"
          value={cur.og_image || ""}
          onChange={(e) => update("og_image", e.target.value)}
          placeholder="/img/og-home.jpg"
        />
        <Field
          label="Keywords"
          hint="Mots-clés (séparés par virgules)"
          value={cur.keywords || ""}
          onChange={(e) => update("keywords", e.target.value)}
        />

        <div className="flex items-center gap-4 pt-6 border-t border-white/5">
          <button
            type="submit"
            disabled={saving}
            className="cta-button cta-button-primary disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-green-400 text-sm"
            >
              ✓ Enregistré
            </motion.span>
          )}
        </div>
      </motion.form>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-4 bg-gold/5 border border-gold-dim/30 rounded-md text-xs text-fg-muted leading-relaxed"
      >
        <strong className="text-gold not-italic">Note</strong> — en mode SPA pur, ces
        meta tags ne sont pas vus par les crawlers qui ne rendent pas JS (Bing,
        LinkedIn preview, WhatsApp). Voir <code>deploy/SSR.md</code> pour la solution.
      </motion.div>
    </div>
  );
}

function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted block">
        {label}
      </span>
      {hint && <span className="block text-[0.65rem] text-fg-muted/70 mb-1.5">{hint}</span>}
      <input
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-2.5 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors text-sm"
      />
    </label>
  );
}

function TextArea({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted block">
        {label}
      </span>
      {hint && <span className="block text-[0.65rem] text-fg-muted/70 mb-1.5">{hint}</span>}
      <textarea
        rows={3}
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-2.5 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors text-sm resize-none"
      />
    </label>
  );
}
