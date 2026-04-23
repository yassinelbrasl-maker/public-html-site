import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/auth/AuthContext";
import { type TeamMember, initialsFor, fullName } from "@/api/users";

/**
 * /plateforme/equipe — Gestion des membres de l'équipe.
 * Consomme /cortoba-plateforme/api/users.php (sans le ?public=1, pour avoir
 * tous les membres, même ceux non affichés sur le site public).
 */
export function EquipeSection() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeamMember | null>(null);

  useEffect(() => {
    apiFetch("/cortoba-plateforme/api/users.php")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setMembers(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">👥</span>
          <h1 className="font-serif text-3xl font-light text-fg">Équipe</h1>
          {members && (
            <span className="px-3 py-1 rounded-full bg-gold/10 text-gold text-xs tracking-wider">
              {members.length} membre{members.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          className="cta-button cta-button-primary text-xs"
        >
          ＋ Inviter un membre
        </button>
      </motion.div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/5 border border-red-500/30 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {!error && members === null && (
        <div className="p-10 text-center text-sm text-fg-muted">Chargement…</div>
      )}

      {!error && members !== null && members.length === 0 && (
        <div className="p-10 text-center text-sm text-fg-muted">
          Aucun membre pour l'instant.
        </div>
      )}

      {!error && members !== null && members.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {members.map((m, i) => {
              const statut = (m as { statut?: string }).statut || "Actif";
              const inactive = statut === "Inactif";
              return (
                <motion.button
                  key={m.id}
                  layout
                  onClick={() => setSelected(m)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                  whileHover={{ y: -3 }}
                  className={`text-left bg-bg-card border border-white/5 rounded-md p-5 hover:border-gold-dim transition-colors ${
                    inactive ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {m.profile_picture_url ? (
                      <img
                        src={m.profile_picture_url}
                        alt={fullName(m)}
                        className="w-14 h-14 rounded-full object-cover border border-gold-dim"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-bg border border-gold-dim flex items-center justify-center text-gold font-serif text-xl">
                        {initialsFor(m)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-base text-fg truncate">
                        {fullName(m) || "Sans nom"}
                      </div>
                      <div className="text-xs text-fg-muted truncate">
                        {m.role || m.spec || ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[0.62rem] tracking-wider uppercase">
                    <span
                      className={
                        inactive ? "text-red-400" : "text-green-400"
                      }
                    >
                      ● {statut}
                    </span>
                    {(m as { is_admin?: number | boolean }).is_admin ? (
                      <span className="text-gold">Admin</span>
                    ) : (m as { isMember?: boolean }).isMember ? (
                      <span className="text-fg-muted">Membre</span>
                    ) : null}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <MemberDrawer member={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MemberDrawer({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const m = member as TeamMember & {
    statut?: string;
    tel?: string;
    email?: string;
    is_admin?: number | boolean;
    modules?: string[] | string;
  };
  const modules =
    typeof m.modules === "string"
      ? (() => {
          try {
            return JSON.parse(m.modules) as string[];
          } catch {
            return [];
          }
        })()
      : Array.isArray(m.modules)
      ? m.modules
      : [];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 z-50"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-bg-elev border-l border-white/5 z-50 overflow-auto"
      >
        <div className="sticky top-0 bg-bg-elev/95 backdrop-blur-sm border-b border-white/5 p-5 flex items-center justify-between">
          <h3 className="font-serif text-xl text-fg">{fullName(m)}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 hover:border-gold hover:text-gold text-fg-muted"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="flex items-center justify-center mb-6">
            {m.profile_picture_url ? (
              <img
                src={m.profile_picture_url}
                className="w-24 h-24 rounded-full object-cover border border-gold-dim"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-bg-card border border-gold-dim flex items-center justify-center text-gold font-serif text-3xl">
                {initialsFor(m)}
              </div>
            )}
          </div>
          <Row label="Email">{m.email || "—"}</Row>
          <Row label="Téléphone">{m.tel || "—"}</Row>
          <Row label="Rôle">{m.role || m.spec || "—"}</Row>
          <Row label="Statut">{m.statut || "Actif"}</Row>
          <Row label="Admin">{m.is_admin ? "Oui" : "Non"}</Row>
          {modules.length > 0 && (
            <div className="pt-2">
              <div className="text-xs text-fg-muted uppercase tracking-[0.15em] mb-2">
                Modules autorisés
              </div>
              <div className="flex flex-wrap gap-1">
                {modules.map((mod) => (
                  <span
                    key={mod}
                    className="text-xs px-2 py-1 rounded-full bg-gold/10 border border-gold-dim/30 text-gold"
                  >
                    {mod}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="pt-6 border-t border-white/5 flex gap-2">
            <button
              type="button"
              className="cta-button text-xs flex-1 justify-center"
            >
              ✎ Modifier
            </button>
            <button
              type="button"
              className="cta-button text-xs flex-1 justify-center hover:border-red-400/50 hover:text-red-400"
            >
              🗑 Supprimer
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 pb-2 border-b border-white/5">
      <span className="text-fg-muted text-xs uppercase tracking-[0.15em]">
        {label}
      </span>
      <span className="text-fg text-right">{children}</span>
    </div>
  );
}
