import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfigurator } from "../context";
import { StepHeading } from "./_shared";
import { StepNav } from "../StepNav";
import { MISSION_CATEGORIES, DEFAULT_MISSIONS, type Mission } from "../data";
import clsx from "clsx";

/**
 * Step 2 — Missions.
 *
 * Porte cfgRenderMissions() du legacy :
 *  - Missions groupées par catégorie (accordions <details>)
 *  - Chaque catégorie a un compteur X/Y et un bouton "tout cocher"
 *  - Recherche texte filtrant les missions (normalisée sans accents)
 *  - Selected missions affichées en tags retirables
 */
export function Step2Missions() {
  const { state, dispatch } = useConfigurator();
  const [search, setSearch] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set(state.cfg_missions),
    [state.cfg_missions]
  );

  const missionsByCat = useMemo(() => {
    const filter = search.trim()
      ? search
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      : null;
    const result: Record<string, Mission[]> = {};
    for (const cat of MISSION_CATEGORIES) result[cat.id] = [];
    for (const m of DEFAULT_MISSIONS) {
      if (filter) {
        const norm = m.nom
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!norm.includes(filter)) continue;
      }
      if (!result[m.cat]) result[m.cat] = [];
      result[m.cat].push(m);
    }
    return result;
  }, [search]);

  function toggleMission(id: string) {
    const list = new Set(state.cfg_missions);
    if (list.has(id)) list.delete(id);
    else list.add(id);
    dispatch({
      type: "SET",
      key: "cfg_missions",
      value: Array.from(list),
    });
  }

  function toggleAllCat(catId: string) {
    const catMissions = missionsByCat[catId] || [];
    const allSelected = catMissions.every((m) => selectedIds.has(m.id));
    const list = new Set(state.cfg_missions);
    for (const m of catMissions) {
      if (allSelected) list.delete(m.id);
      else list.add(m.id);
    }
    dispatch({
      type: "SET",
      key: "cfg_missions",
      value: Array.from(list),
    });
  }

  const selectedMissions = useMemo(
    () => DEFAULT_MISSIONS.filter((m) => selectedIds.has(m.id)),
    [selectedIds]
  );

  return (
    <>
      <StepHeading num="02" title="Les missions que vous souhaitez nous confier">
        Sélectionnez une ou plusieurs missions. Tout est modifiable : il s'agit d'une
        première indication pour préparer votre entretien.
      </StepHeading>

      {/* Recherche */}
      <div className="mb-4 relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher votre mission…"
          className="w-full bg-bg-card border border-white/10 rounded-md pl-10 pr-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* Selected missions tags */}
      <AnimatePresence initial={false}>
        {selectedMissions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="p-3 bg-gold/5 border border-gold-dim rounded-md">
              <p className="text-[0.65rem] tracking-[0.2em] uppercase text-gold mb-2">
                {selectedMissions.length} mission
                {selectedMissions.length > 1 ? "s" : ""} sélectionnée
                {selectedMissions.length > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {selectedMissions.map((m) => (
                    <motion.span
                      key={m.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center gap-1.5 bg-gold/10 border border-gold/25 rounded-full pl-3 pr-1.5 py-1 text-xs text-fg"
                    >
                      <span>{m.nom}</span>
                      <button
                        type="button"
                        onClick={() => toggleMission(m.id)}
                        className="text-fg-muted hover:text-red-400 px-1 transition-colors"
                        aria-label={`Retirer ${m.nom}`}
                      >
                        ×
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories accordion */}
      <div className="space-y-2">
        {MISSION_CATEGORIES.map((cat) => {
          const catMissions = missionsByCat[cat.id] || [];
          if (catMissions.length === 0 && !search) return null;
          if (catMissions.length === 0 && search) return null;
          const checkedCount = catMissions.filter((m) =>
            selectedIds.has(m.id)
          ).length;
          const isOpen = openCat === cat.id || !!search;

          return (
            <div
              key={cat.id}
              className="rounded-md border border-white/5 bg-bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenCat(isOpen ? null : cat.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      "text-xs transition-transform",
                      isOpen && "rotate-180"
                    )}
                  >
                    ▾
                  </span>
                  <span className="text-xs uppercase tracking-[0.1em] font-semibold text-gold">
                    {cat.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      "text-xs tabular-nums",
                      checkedCount > 0 ? "text-gold" : "text-fg-muted"
                    )}
                  >
                    {checkedCount}/{catMissions.length}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllCat(cat.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        toggleAllCat(cat.id);
                      }
                    }}
                    className="text-[0.62rem] px-2 py-1 rounded-md border border-white/10 hover:border-gold text-fg-muted hover:text-gold cursor-pointer transition-colors"
                  >
                    tout cocher
                  </span>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-4 pb-4">
                      {catMissions.map((m) => {
                        const selected = selectedIds.has(m.id);
                        return (
                          <label
                            key={m.id}
                            className={clsx(
                              "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors",
                              selected
                                ? "text-fg bg-gold/5"
                                : "text-fg-muted hover:bg-white/[0.03]"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleMission(m.id)}
                              className="accent-gold"
                            />
                            <span>{m.nom}</span>
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <StepNav />
    </>
  );
}
