/**
 * Cortoba — Island 2 : Configurateur step transitions
 *
 * React + framer-motion montés en island au-dessus du formulaire multi-étapes
 * du configurateur. L'île prend la responsabilité des transitions entre étapes
 * (direction-aware slide + cross-fade), mais laisse intact :
 *   - Toute la logique de formulaire (cfgState, cfgValidateStep, inputs…)
 *   - Les effets de bord liés à chaque étape (cfgRenderMissions, cfgInitMap,
 *     cfgUpdateProgramme, cfgUpdateRecap)
 *   - La soumission (cfgSubmit), le redémarrage (cfgRestart), la page client,
 *     la page succès
 *
 * Principe : on remplace window.cfgGo par une version qui :
 *   1. Exécute la validation originale
 *   2. Synchronise l'état via React (setState)
 *   3. Laisse un useEffect gérer l'animation des DOM pages avec framer-motion
 *   4. Rejoue les effets de bord de l'étape cible
 *
 * Fallback : si cet îlot ne charge pas, la version originale de cfgGo reste
 * attachée à window et le configurateur fonctionne en mode vanilla (display
 * none/block, animation CSS cfgFadeUp).
 */

import React, { useState, useEffect, useRef } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import {
  animate as fmAnimate,
  AnimatePresence,
  motion,
} from "https://esm.sh/framer-motion@11.11.17?deps=react@18.3.1,react-dom@18.3.1";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);

// ─── Désactive l'animation CSS native de .cfg-page (on prend la main) ───
(function injectStyle() {
  const s = document.createElement('style');
  s.setAttribute('data-corto-stepper', 'true');
  s.textContent = `
    /* Island actif : on gère la transition via framer-motion, pas via CSS */
    .cfg-page { animation: none !important; }
    .cfg-step-indicator-pill {
      display: inline-flex; align-items: center; gap: 0.55rem;
      background: rgba(200,169,110,0.1);
      border: 1px solid rgba(200,169,110,0.3);
      color: #c8a96e; padding: 0.35rem 0.9rem;
      border-radius: 999px;
      font-size: 0.68rem; letter-spacing: 0.2em;
      text-transform: uppercase; font-weight: 600;
      margin: 0 auto 1.5rem; pointer-events: none;
    }
    .cfg-step-indicator-wrap {
      display: flex; justify-content: center;
      margin: 1.25rem auto 0.25rem;
      padding: 0 2rem;
    }
  `;
  document.head.appendChild(s);
})();

// ─── Labels (doivent matcher l'ordre et l'orthographe des étapes HTML) ───
const STEP_LABELS = {
  1: 'Projet',
  2: 'Missions',
  3: 'Fondations',
  4: 'Identité',
  5: 'Programme',
  6: 'Terrain',
};

function Stepper() {
  const [step, setStep] = useState(
    typeof window.cfgCurrentStep === 'number' ? window.cfgCurrentStep : 1
  );
  const prevStepRef = useRef(step);
  const busyRef = useRef(false);
  const originalGoRef = useRef(null);

  // ─── Patch global cfgGo : on intercepte les navigations par numéro 1-6 ───
  useEffect(() => {
    if (originalGoRef.current) return; // déjà patché
    const original = window.cfgGo;
    originalGoRef.current = original;

    window.cfgGo = function patchedCfgGo(n) {
      // Laisser passer les appels non numériques au cas où (défensif)
      if (typeof n !== 'number') {
        return original ? original.apply(this, arguments) : undefined;
      }
      // Validation : on respecte exactement la logique d'origine
      if (n > (window.cfgCurrentStep || 1) && typeof window.cfgValidateStep === 'function') {
        const err = window.cfgValidateStep(window.cfgCurrentStep || 1);
        if (err) {
          if (typeof window.cfgShowError === 'function') window.cfgShowError(err);
          return;
        }
      }
      if (typeof window.cfgHideError === 'function') window.cfgHideError();

      // Bloquer le re-trigger pendant une transition en cours
      if (busyRef.current) return;

      setStep(n);
    };

    // ─── Patcher cfgRestart pour resynchroniser l'état React ───
    const originalRestart = window.cfgRestart;
    if (typeof originalRestart === 'function') {
      window.cfgRestart = function patchedCfgRestart() {
        originalRestart.apply(this, arguments);
        // cfgRestart remet cfgCurrentStep à 1 et nettoie les classes.
        // On resynchronise React sans relancer la transition.
        prevStepRef.current = 1;
        setStep(1);
      };
    }

    // Cleanup au démontage (ne devrait pas arriver en prod mais propre)
    return () => {
      window.cfgGo = original;
      if (typeof originalRestart === 'function') {
        window.cfgRestart = originalRestart;
      }
    };
  }, []);

  // ─── Quand React "step" change : animer la transition DOM ───
  useEffect(() => {
    const prev = prevStepRef.current;
    if (prev === step) return;

    const oldEl = document.getElementById('cfg-step-' + prev);
    const newEl = document.getElementById('cfg-step-' + step);
    const forward = step > prev;

    busyRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        // 1. Fade-out + slide de la page sortante
        if (oldEl) {
          try {
            await fmAnimate(
              oldEl,
              { opacity: 0, x: forward ? -24 : 24 },
              { duration: 0.22, ease: [0.4, 0, 1, 1] }
            ).finished;
          } catch (_) { /* animation annulée : on continue quand même */ }
          if (cancelled) return;
          oldEl.classList.remove('active', 'slide-back');
          oldEl.style.opacity = '';
          oldEl.style.transform = '';
        }

        // 2. Entrée de la nouvelle page
        if (newEl) {
          newEl.classList.add('active');
          newEl.style.opacity = '0';
          newEl.style.transform = 'translateX(' + (forward ? 24 : -24) + 'px)';
          // force reflow pour que la valeur initiale prenne effet avant l'animate
          void newEl.offsetHeight;
          try {
            await fmAnimate(
              newEl,
              { opacity: 1, x: 0 },
              { duration: 0.38, ease: [0.22, 0.61, 0.36, 1] }
            ).finished;
          } catch (_) {}
          if (cancelled) return;
          newEl.style.opacity = '';
          newEl.style.transform = '';
        }

        // 3. Met à jour le stepper indicator (pastilles numérotées en haut)
        document.querySelectorAll('.cfg-step').forEach((d) => {
          const sn = parseInt(d.dataset.step);
          d.classList.remove('active', 'done');
          if (!isNaN(sn)) {
            if (sn < step) d.classList.add('done');
            if (sn === step) d.classList.add('active');
          }
        });

        // 4. Barre de progression
        const pct = Math.round((step / 6) * 100);
        const pb = document.getElementById('cfg-progress-bar');
        if (pb) pb.style.width = pct + '%';

        // 5. État global
        window.cfgCurrentStep = step;

        // 6. Effets de bord (copie des side effects du cfgGo d'origine)
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (step === 2 && typeof window.cfgRenderMissions === 'function') {
          window.cfgRenderMissions();
        }
        if (step === 6 && typeof window.cfgInitMap === 'function') {
          setTimeout(window.cfgInitMap, 200);
        }
        if (step === 5 && typeof window.cfgUpdateProgramme === 'function') {
          window.cfgUpdateProgramme();
        }
        if (typeof window.cfgUpdateRecap === 'function') {
          window.cfgUpdateRecap();
        }
      } finally {
        busyRef.current = false;
      }
    })();

    prevStepRef.current = step;

    return () => { cancelled = true; };
  }, [step]);

  // ─── Indicateur visuel : pastille "Étape X / 6 · Label" ───
  // Animée par key-based remount (enter transition uniquement, pas d'exit ;
  // mode="wait" de AnimatePresence peut se bloquer si l'onglet est throttlé).
  const label = STEP_LABELS[step] || '';

  return html`
    <div className="cfg-step-indicator-wrap">
      <${motion.div}
        key=${step}
        className="cfg-step-indicator-pill"
        initial=${{ opacity: 0, y: -6 }}
        animate=${{ opacity: 1, y: 0 }}
        transition=${{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
      >
        Étape ${step} / 6 · ${label}
      <//>
    </div>
  `;
}

// ─── Mount : on injecte le composant juste sous la stepper navigation ───
function mount() {
  const stepper = document.getElementById('cfg-steps');
  if (!stepper) {
    // Le configurateur n'est pas sur cette page — rien à faire
    return;
  }
  const container = document.createElement('div');
  container.id = 'cfg-stepper-island';
  stepper.parentNode.insertBefore(container, stepper.nextSibling);
  createRoot(container).render(html`<${Stepper}/>`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 100), { once: true });
} else {
  setTimeout(mount, 100);
}
