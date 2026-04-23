import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { LoginScreen } from "./LoginScreen";
import { SettingsShell } from "./SettingsShell";
import { Seo } from "@/seo/Seo";

/**
 * /settings — Panneau admin public (gestion du contenu du site).
 * Flow :
 *   - Pas de token → LoginScreen
 *   - Chargement de /me → splash
 *   - Authentifié → SettingsShell (sidebar + sections)
 *
 * Chaque section est un mini-CRUD qui consomme l'API PHP existante.
 */
export function SettingsPage() {
  return (
    <AuthProvider>
      <SettingsRoot />
    </AuthProvider>
  );
}

function SettingsRoot() {
  const { user, loading } = useAuth();
  const [section, setSection] = useState<string>("projects");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="text-fg-muted text-sm"
        >
          Vérification de la session…
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {user ? (
        <motion.div
          key="shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SettingsShell section={section} onSectionChange={setSection} />
        </motion.div>
      ) : (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <LoginScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
