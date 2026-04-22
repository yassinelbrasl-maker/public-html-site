import { Outlet, Link } from "react-router-dom";
import { motion } from "framer-motion";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
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
        <Link to="/landscaping" className="text-fg-muted hover:text-gold transition-colors">
          Landscaping
        </Link>
        {/* Language switcher — stub. Real i18n wiring to follow. */}
        <button className="text-fg underline underline-offset-4">FR</button>
        <button className="text-fg-muted">EN</button>
        <button className="text-fg-muted">AR</button>
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
