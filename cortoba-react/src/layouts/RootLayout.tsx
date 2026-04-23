import { Outlet, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS } from "@/i18n/locales";
import clsx from "clsx";

export function RootLayout() {
  const location = useLocation();
  // Les routes admin ont leur propre layout (sidebar + header interne).
  // On cache le header/footer public pour éviter le chevauchement visuel.
  const isAdmin =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/plateforme");

  return (
    <div className="min-h-screen flex flex-col">
      {!isAdmin && <Header />}
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      {!isAdmin && <Footer />}
    </div>
  );
}

function Header() {
  const { t, locale, setLocale } = useI18n();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 backdrop-blur-sm"
    >
      <Link to="/" className="flex flex-col leading-tight">
        <span className="font-serif italic text-lg text-fg">Cortoba</span>
        <span className="text-[0.55rem] tracking-[0.3em] uppercase text-fg-muted">
          Architecture Studio
        </span>
      </Link>
      <nav className="flex items-center gap-6 text-xs tracking-[0.1em] uppercase">
        <Link
          to="/landscaping"
          className="text-fg-muted hover:text-gold transition-colors"
        >
          {t("nav_landscaping")}
        </Link>
        <div className="flex items-center gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={clsx(
                "px-2 py-1 text-[0.7rem] tracking-wider uppercase transition-colors",
                locale === l
                  ? "text-fg underline underline-offset-4"
                  : "text-fg-muted hover:text-fg"
              )}
              aria-label={`Change language to ${l}`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </nav>
    </motion.header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 text-center text-xs text-fg-muted">
      © {new Date().getFullYear()} Cortoba Architecture Studio
    </footer>
  );
}
