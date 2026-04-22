import { useState } from "react";
import { motion } from "framer-motion";
import { useConfigurator } from "../context";
import { StepHeading } from "./_shared";
import { validateClient } from "../validation";
import { submitConfigurator } from "../submit";

export function StepClient() {
  const { state, dispatch, goTo, setError } = useConfigurator();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateClient(state);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    const res = await submitConfigurator(state);
    setSubmitting(false);
    if (res.ok) {
      setError(null);
      goTo("success");
    } else {
      setLocalError("Erreur lors de l'envoi : " + res.error + ". Veuillez réessayer.");
    }
  }

  function field<K extends keyof typeof state>(key: K) {
    return {
      value: state[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        dispatch({ type: "SET", key, value: e.target.value }),
    };
  }

  return (
    <>
      <StepHeading num="📩" title="Recevez votre estimation">
        Laissez-nous vos coordonnées. Un architecte vous recontacte sous 48h avec une
        estimation détaillée et personnalisée.
      </StepHeading>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="Prénom *"
            {...field("cfg_f_prenom")}
            placeholder="Votre prénom"
            autoComplete="given-name"
            required
          />
          <Input
            label="Nom *"
            {...field("cfg_f_nom")}
            placeholder="Votre nom"
            autoComplete="family-name"
            required
          />
        </div>
        <Input
          label="Téléphone *"
          type="tel"
          {...field("cfg_f_tel")}
          placeholder="+216 …"
          autoComplete="tel"
          required
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="cfg-wa-same"
            checked={state.cfg_wa_same}
            onChange={(e) => {
              const same = e.target.checked;
              dispatch({
                type: "PATCH",
                patch: {
                  cfg_wa_same: same,
                  cfg_f_whatsapp: same ? state.cfg_f_tel : "",
                },
              });
            }}
            className="accent-gold"
          />
          <label htmlFor="cfg-wa-same" className="text-xs text-fg-muted">
            Mon WhatsApp est le même numéro
          </label>
        </div>
        {!state.cfg_wa_same && (
          <Input
            label="WhatsApp (optionnel)"
            type="tel"
            {...field("cfg_f_whatsapp")}
            placeholder="+216 …"
            autoComplete="tel"
          />
        )}
        <Input
          label="Email (optionnel)"
          type="email"
          {...field("cfg_f_email")}
          placeholder="vous@exemple.com"
          autoComplete="email"
        />

        {localError && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-400"
          >
            ⚠ {localError}
          </motion.p>
        )}

        <div className="flex items-center gap-4 pt-6 border-t border-white/5">
          <button
            type="button"
            onClick={() => goTo(6)}
            className="cta-button"
            disabled={submitting}
          >
            ← Retour
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="cta-button cta-button-primary ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Envoi…" : "✦ Envoyer ma demande"}
          </button>
        </div>
      </form>
    </>
  );
}

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-1.5 block">
        {label}
      </span>
      <input
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
      />
    </label>
  );
}
