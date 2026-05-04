import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";

interface GeneralSettings {
  tel1?: string;
  tel2?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}

/**
 * Settings → Général (infos de contact, réseaux sociaux).
 * Lit/écrit /cortoba-plateforme/api/data.php?table=parametres (clés diverses).
 */
export function GeneralSection() {
  const [form, setForm] = useState<GeneralSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/data.php?table=parametres")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} sur data.php?table=parametres`);
        return r.json();
      })
      .then((data) => {
        if (data.success === false) {
          throw new Error(data.error || "Erreur serveur");
        }
        const d = data.data || {};
        setForm({
          tel1: d.contact_tel1 || "",
          tel2: d.contact_tel2 || "",
          whatsapp: d.contact_whatsapp || "",
          email: d.contact_email || "",
          address: d.contact_address || "",
          instagram: d.social_instagram || "",
          facebook: d.social_facebook || "",
          linkedin: d.social_linkedin || "",
        });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiFetch(
        "/cortoba-plateforme/api/data.php?table=parametres",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_tel1: form.tel1 || "",
            contact_tel2: form.tel2 || "",
            contact_whatsapp: form.whatsapp || "",
            contact_email: form.email || "",
            contact_address: form.address || "",
            social_instagram: form.instagram || "",
            social_facebook: form.facebook || "",
            social_linkedin: form.linkedin || "",
          }),
        }
      );
      const raw = await res.json().catch(() => ({}));
      if (!res.ok || raw.success === false) {
        throw new Error(raw.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function input<K extends keyof GeneralSettings>(key: K) {
    return {
      value: form[key] || "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  return (
    <div className="max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <span className="text-3xl">⚙️</span>
        <h1 className="font-serif text-3xl font-light text-fg">Paramètres généraux</h1>
      </motion.div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="text-fg-muted hover:text-fg">
            ×
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="text-sm text-fg-muted">Chargement…</div>
      ) : (
        <motion.form
          onSubmit={save}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-8"
        >
          <Group title="Contact">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Téléphone principal" {...input("tel1")} placeholder="+216 94 119 120" />
              <Field label="Téléphone secondaire" {...input("tel2")} placeholder="+216 97 254 736" />
              <Field label="WhatsApp" {...input("whatsapp")} placeholder="+216 …" />
              <Field label="Email" type="email" {...input("email")} placeholder="contact@cortoba…" />
            </div>
            <Field label="Adresse" {...input("address")} placeholder="Immeuble Cortoba, Midoun…" />
          </Group>

          <Group title="Réseaux sociaux">
            <Field label="Instagram URL" {...input("instagram")} placeholder="https://instagram.com/…" />
            <Field label="Facebook URL" {...input("facebook")} placeholder="https://facebook.com/…" />
            <Field label="LinkedIn URL" {...input("linkedin")} placeholder="https://linkedin.com/…" />
          </Group>

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
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs tracking-[0.2em] uppercase text-gold font-semibold">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
        {label}
      </span>
      <input
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-2.5 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors text-sm"
      />
    </label>
  );
}
