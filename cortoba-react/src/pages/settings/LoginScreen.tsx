import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/auth/AuthContext";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await login(email.trim(), password);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
        className="w-full max-w-sm bg-bg-card border border-white/10 rounded-xl p-10 text-center"
      >
        <img
          src="/img/Copilot_20250803_202525.png"
          alt="Cortoba"
          className="h-10 mx-auto mb-8"
        />
        <h2 className="text-base font-semibold text-fg mb-2">Paramètres du site</h2>
        <p className="text-xs text-fg-muted mb-8">
          Connectez-vous avec votre compte administrateur
        </p>

        <form onSubmit={onSubmit} className="space-y-3 text-left">
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-red-400 text-center"
            >
              {error}
            </motion.p>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full bg-bg border border-white/10 rounded-md px-4 py-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full bg-bg border border-white/10 rounded-md px-4 py-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
          />
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full bg-gold text-bg font-bold text-[0.72rem] tracking-[0.1em] uppercase py-3 rounded-md hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
