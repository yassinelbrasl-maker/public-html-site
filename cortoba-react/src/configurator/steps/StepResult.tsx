import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useConfigurator } from "../context";
import { calculate, fmtEur, fmtEurFull } from "../calc";
import { OPERATIONS, STYLES, STANDINGS, TERRAIN_NATURES } from "../data";

/**
 * StepResult — page de résultats entre Step 6 (Terrain) et StepClient.
 *
 * - Calcul en temps réel via calculate() (pure function)
 * - Persiste _lastSurfaceInt / _lastVillaLow / _lastVillaHigh dans l'état
 *   pour que le POST /api/demandes.php contienne ces valeurs
 * - CTA « Obtenir mon devis personnalisé » → StepClient
 */
export function StepResult() {
  const { state, dispatch, goTo } = useConfigurator();

  const result = useMemo(() => calculate(state), [state]);

  // Compte le nombre de paramètres que l'utilisateur a réellement renseignés
  // — utilisé pour le "mode indicator" (estimation rapide vs. détaillée).
  const paramCount = useMemo(() => {
    let count = 0;
    if (state.cfg_nom_projet) count++;
    if (state.cfg_type) count++;
    if (state.cfg_operation) count++;
    if (state.cfg_style) count++;
    if (state.cfg_standing) count++;
    if (state.cfg_terrain_nature) count++;
    if (state.cfg_missions.length > 0) count++;
    if (state.cfg_chambres_list.length > 0) count++;
    if (state.cfg_suite_parentale) count++;
    if (state.cfg_cuisine_type) count++;
    if (state.cfg_terrain_lat != null) count++;
    return count;
  }, [state]);

  const mode =
    paramCount >= 8
      ? { label: "Détaillée", color: "text-green-400", emoji: "🎯" }
      : paramCount >= 5
      ? { label: "Standard", color: "text-gold", emoji: "⚡" }
      : { label: "Rapide", color: "text-fg-muted", emoji: "💨" };

  // Lookup des libellés humains pour les choix clés — affichés en recap.
  const choices = useMemo(() => {
    return {
      operation: OPERATIONS.find((o) => o.id === state.cfg_operation),
      style: STYLES.find((s) => s.id === state.cfg_style),
      standing: STANDINGS.find((s) => s.id === state.cfg_standing),
      terrain: TERRAIN_NATURES.find((t) => t.id === state.cfg_terrain_nature),
    };
  }, [state.cfg_operation, state.cfg_style, state.cfg_standing, state.cfg_terrain_nature]);

  // Persiste les valeurs calculées dans l'état pour la soumission
  useEffect(() => {
    dispatch({
      type: "PATCH",
      patch: {
        _lastSurfaceInt: result.surfaceHabitable,
        _lastVillaLow: result.totalLow,
        _lastVillaHigh: result.totalHigh,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.surfaceHabitable, result.totalLow, result.totalHigh]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <p className="text-[0.65rem] tracking-[0.3em] uppercase text-gold mb-3">
          Estimation personnalisée
        </p>
        <h2 className="font-serif text-3xl md:text-5xl font-light leading-tight">
          Félicitations,<br />
          votre projet <em className="text-gold not-italic italic">prend forme !</em>
        </h2>
        {state.cfg_nom_projet && (
          <p className="mt-3 text-fg-muted italic">« {state.cfg_nom_projet} »</p>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-4 inline-flex items-center gap-2 bg-bg-card border border-white/10 rounded-full px-3 py-1 text-xs"
        >
          <span>{mode.emoji}</span>
          <span className={mode.color}>Estimation {mode.label.toLowerCase()}</span>
          <span className="text-fg-muted">·</span>
          <span className="text-fg-muted tabular-nums">
            {paramCount}/11 paramètres
          </span>
        </motion.div>
      </motion.div>

      {/* Big number hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative overflow-hidden bg-bg-card border border-gold-dim/40 rounded-xl p-8 md:p-10 mb-8"
      >
        <div className="relative z-10">
          <p className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-2">
            Coût total estimé
          </p>
          <div className="flex flex-wrap items-baseline gap-3">
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="font-serif text-5xl md:text-7xl text-gold font-light"
            >
              {fmtEur(result.totalLow)}
            </motion.span>
            <span className="text-fg-muted text-lg">—</span>
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="font-serif text-5xl md:text-7xl text-fg font-light"
            >
              {fmtEur(result.totalHigh)}
            </motion.span>
          </div>
          <p className="mt-3 text-sm text-fg-muted leading-relaxed max-w-xl">
            Fourchette basée sur une surface habitable estimée de{" "}
            <strong className="text-fg">{result.surfaceHabitable} m²</strong>{" "}
            (dont {result.surfaceCouverte} m² couverts). Délai de réalisation
            indicatif :{" "}
            <strong className="text-fg">
              {result.delaiMoisMin}–{result.delaiMoisMax} mois
            </strong>
            .
          </p>
        </div>
        {/* Decoration */}
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
      </motion.div>

      {/* Recap des choix — ce qui a influencé l'estimation */}
      {(choices.operation || choices.style || choices.standing || choices.terrain) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-6 p-5 bg-bg-card/70 border border-white/5 rounded-md"
        >
          <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-4">
            Vos choix
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {choices.operation && (
              <ChoiceCard
                icon={choices.operation.icon}
                label="Opération"
                value={choices.operation.title}
                mult={result.operationMult}
              />
            )}
            {choices.style && (
              <ChoiceCard
                icon="🎨"
                label="Style"
                value={choices.style.title}
                mult={result.styleMult}
              />
            )}
            {choices.standing && (
              <ChoiceCard
                icon={choices.standing.icon}
                label="Standing"
                value={choices.standing.title}
                hint={`${result.cpp} €/m²`}
              />
            )}
            {choices.terrain && (
              <ChoiceCard
                icon={choices.terrain.icon}
                label="Terrain"
                value={choices.terrain.title}
                mult={result.terrainMult}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Breakdown grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Rooms */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="p-5 bg-bg-card border border-white/5 rounded-md"
        >
          <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-4">
            Bilan des surfaces
          </p>
          {result.rooms.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Aucune pièce sélectionnée. Repassez à l'étape Programme pour
              détailler votre projet.
            </p>
          ) : (
            <ul className="space-y-2">
              {result.rooms.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
                >
                  <span className="text-sm text-fg">
                    {r.label}
                    {r.external && (
                      <span className="ml-2 text-[0.6rem] text-fg-muted uppercase">
                        extérieur
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-fg-muted tabular-nums">
                    {r.surface} m²
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 pt-3 mt-2 border-t border-gold-dim/30 font-medium">
                <span className="text-sm text-gold">
                  Surface habitable (× 1,15 circ.)
                </span>
                <span className="text-sm text-gold tabular-nums">
                  {result.surfaceHabitable} m²
                </span>
              </li>
            </ul>
          )}
        </motion.div>

        {/* Cost breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="p-5 bg-bg-card border border-white/5 rounded-md"
        >
          <p className="text-xs tracking-[0.2em] uppercase text-gold font-semibold mb-4">
            Décomposition du coût
          </p>
          <ul className="space-y-2">
            <CostRow
              label="Construction"
              detail={`${result.cpp} €/m² × ${result.surfaceHabitable} m² × ${result.operationMult}`}
              value={`${fmtEurFull(result.villaCostLow)} – ${fmtEurFull(result.villaCostHigh)}`}
            />
            {result.extras.map((e) => (
              <CostRow
                key={e.label}
                label={e.label}
                detail={e.detail}
                value={fmtEurFull(e.cost)}
              />
            ))}
            <li className="flex items-center justify-between gap-4 pt-3 mt-2 border-t border-gold-dim/30 font-medium">
              <span className="text-sm text-gold">Total estimé</span>
              <span className="text-sm text-gold tabular-nums text-right">
                {fmtEurFull(result.totalLow)}
                <br />
                <span className="text-fg-muted text-xs">à</span>{" "}
                {fmtEurFull(result.totalHigh)}
              </span>
            </li>
          </ul>
        </motion.div>
      </div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="p-4 bg-gold/5 border border-gold-dim/30 rounded-md text-xs text-fg-muted leading-relaxed mb-8"
      >
        ℹ Cette estimation est <strong className="text-fg">indicative</strong> et
        s'appuie sur des ratios architecturaux moyens en Tunisie. Le coût final
        dépendra des contraintes du site, des matériaux choisis, et du niveau de
        prestation souhaité. Un rendez-vous avec un de nos architectes permet
        d'affiner cette fourchette avec précision.
      </motion.div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-4 pt-8 border-t border-white/5">
        <button
          type="button"
          onClick={() => goTo(6)}
          className="cta-button"
        >
          ← Modifier mon projet
        </button>
        <motion.button
          type="button"
          onClick={() => goTo("client")}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="cta-button cta-button-primary ml-auto"
        >
          ✦ Obtenir mon devis personnalisé →
        </motion.button>
      </div>
    </>
  );
}

function CostRow({
  label,
  detail,
  value,
}: {
  label: string;
  detail?: string;
  value: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <div>
        <div className="text-sm text-fg">{label}</div>
        {detail && <div className="text-xs text-fg-muted">{detail}</div>}
      </div>
      <span className="text-sm text-fg-muted tabular-nums text-right shrink-0">
        {value}
      </span>
    </li>
  );
}
