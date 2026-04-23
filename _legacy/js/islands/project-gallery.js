/**
 * Cortoba — Island 1 : Project gallery morph
 *
 * React + framer-motion monté en "island" sur la page d'accueil. L'île possède
 * uniquement l'overlay de détail : les cartes du grid restent du HTML vanilla
 * géré par le loader dynamique existant (cortoba-plateforme/api/published_projects.php).
 *
 * Interaction :
 *  - clic sur une .project-card-link -> preventDefault, ouvre l'overlay React
 *    avec l'image animée depuis le rect de la carte source jusqu'au centre
 *  - Échap / clic backdrop -> ferme, retour animé vers la carte source
 *  - CTA "Voir le projet complet" -> navigue vers la page détaillée
 *
 * Progressive enhancement : si ce module échoue à charger (CDN HS, etc.),
 * la navigation par lien <a href> reste intacte.
 *
 * Tech : esm.sh pour React + framer-motion, htm pour le JSX sans build step.
 */

import React, { useState, useEffect, useRef } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import {
  motion,
  AnimatePresence,
} from "https://esm.sh/framer-motion@11.11.17?deps=react@18.3.1,react-dom@18.3.1";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);

// ─── Injection du CSS de l'overlay (portée limitée au composant) ───
const STYLE = `
  .corto-gal-root { position: fixed; inset: 0; pointer-events: none; z-index: 200; }
  .corto-gal-root * { pointer-events: auto; }
  .corto-gal-backdrop {
    position: fixed; inset: 0; background: rgba(10,10,10,0.82);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  }
  .corto-gal-morph {
    position: fixed; overflow: hidden; border-radius: 16px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.55);
    background-size: cover; background-position: center;
    will-change: transform, width, height, top, left;
  }
  .corto-gal-body {
    position: fixed; z-index: 2;
    background: rgba(14,14,14,0.92); color: #ece7dd;
    padding: 28px 36px; border-radius: 14px;
    border: 1px solid rgba(200,169,110,0.25);
    max-width: 620px;
  }
  .corto-gal-body .corto-gal-tag {
    font-size: 11px; letter-spacing: 0.3em; color: #c8a96e;
    text-transform: uppercase; margin: 0 0 10px;
  }
  .corto-gal-body h3 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 300; font-size: 36px; line-height: 1.1;
    margin: 0 0 10px; color: #fff;
  }
  .corto-gal-body .corto-gal-loc {
    font-size: 13px; color: rgba(255,255,255,0.55); margin: 0 0 24px;
  }
  .corto-gal-cta {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 12px 24px; background: #c8a96e; color: #0e0e0e;
    text-decoration: none; border-radius: 999px;
    font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase;
    font-weight: 700;
  }
  .corto-gal-cta:hover { background: #dbbe82; }
  .corto-gal-close {
    position: fixed; top: 24px; right: 24px;
    width: 44px; height: 44px; border-radius: 50%;
    background: rgba(14,14,14,0.9); color: #ece7dd;
    border: 1px solid rgba(255,255,255,0.15);
    font-size: 20px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
  }
  .corto-gal-close:hover { border-color: #c8a96e; color: #c8a96e; }
  @media (max-width: 720px) {
    .corto-gal-body { max-width: calc(100vw - 32px); padding: 20px 22px; }
    .corto-gal-body h3 { font-size: 26px; }
  }
`;

(function injectStyle() {
  const s = document.createElement('style');
  s.setAttribute('data-corto-gal', 'true');
  s.textContent = STYLE;
  document.head.appendChild(s);
})();

// ─── Extrait les données d'une carte depuis le DOM ───
function extractCardData(link) {
  const img = link.querySelector('.project-card-img');
  const rect = img ? img.getBoundingClientRect() : link.getBoundingClientRect();
  const bgImage = img ? img.style.backgroundImage : '';
  const bgPos = img ? img.style.backgroundPosition : '50% 50%';
  const title = link.querySelector('.project-card-title')?.textContent?.trim() || '';
  const tag = link.querySelector('.project-tag')?.textContent?.trim() || '';
  const loc = link.querySelector('.project-card-loc')?.textContent?.trim() || '';
  return {
    href: link.href,
    bgImage,
    bgPos,
    title,
    tag,
    loc,
    rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
  };
}

// ─── Calcule le rect cible (centré, taille responsive) ───
function computeTargetRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(900, vw - 48);
  const maxH = Math.min(540, vh * 0.6);
  // Ratio 16:10 max sur desktop
  let w = maxW;
  let h = Math.min(maxH, w * 0.625);
  if (vw < 720) { w = vw - 24; h = w * 0.65; }
  const x = (vw - w) / 2;
  // Laisse de l'espace en bas pour la body card
  const y = Math.max(40, (vh - h - 260) / 2);
  return { x, y, w, h };
}

// ─── Composant principal ───
function Gallery() {
  const [item, setItem] = useState(null);
  const [target, setTarget] = useState(computeTargetRect);
  const activeLinkRef = useRef(null);

  // Recalculer la cible sur resize pendant qu'un item est ouvert
  useEffect(() => {
    const onResize = () => setTarget(computeTargetRect());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Écoute les clics sur les .project-card-link (délégation — fonctionne aussi
  // pour les cartes ajoutées dynamiquement par le loader existant)
  useEffect(() => {
    function onClick(e) {
      const link = e.target.closest('.project-card-link');
      if (!link) return;
      // Respecter les clics utilisateur avancés (nouvel onglet, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      activeLinkRef.current = link;
      // Cache la carte source pendant le morph pour éviter le double affichage
      link.style.visibility = 'hidden';
      setTarget(computeTargetRect());
      setItem(extractCardData(link));
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Fermeture au clavier (Échap)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function close() {
    setItem(null);
  }

  // Restaurer la visibilité de la carte source quand l'exit finit
  function onExitComplete() {
    if (activeLinkRef.current) {
      activeLinkRef.current.style.visibility = '';
      activeLinkRef.current = null;
    }
  }

  return html`
    <${AnimatePresence} onExitComplete=${onExitComplete}>
      ${item && html`
        <div className="corto-gal-root" key="overlay">
          <${motion.div}
            className="corto-gal-backdrop"
            initial=${{ opacity: 0 }}
            animate=${{ opacity: 1 }}
            exit=${{ opacity: 0 }}
            transition=${{ duration: 0.25 }}
            onClick=${close}
          />
          <${motion.button}
            className="corto-gal-close"
            aria-label="Fermer"
            initial=${{ opacity: 0, scale: 0.8 }}
            animate=${{ opacity: 1, scale: 1 }}
            exit=${{ opacity: 0, scale: 0.8 }}
            transition=${{ duration: 0.2, delay: 0.15 }}
            onClick=${close}
          >×<//>
          <${motion.div}
            className="corto-gal-morph"
            style=${{ backgroundImage: item.bgImage, backgroundPosition: item.bgPos }}
            initial=${{
              top: item.rect.y, left: item.rect.x,
              width: item.rect.w, height: item.rect.h,
              borderRadius: 10,
            }}
            animate=${{
              top: target.y, left: target.x,
              width: target.w, height: target.h,
              borderRadius: 16,
            }}
            exit=${{
              top: item.rect.y, left: item.rect.x,
              width: item.rect.w, height: item.rect.h,
              borderRadius: 10,
              opacity: [1, 1, 0],
            }}
            transition=${{ type: 'spring', stiffness: 220, damping: 28, mass: 0.9 }}
          />
          <${motion.div}
            className="corto-gal-body"
            style=${{
              left: '50%',
              transform: 'translateX(-50%)',
              top: target.y + target.h + 22,
            }}
            initial=${{ opacity: 0, y: 16 }}
            animate=${{ opacity: 1, y: 0 }}
            exit=${{ opacity: 0, y: 8 }}
            transition=${{ duration: 0.35, delay: 0.12 }}
          >
            ${item.tag && html`<p className="corto-gal-tag">${item.tag}<//>`}
            <h3>${item.title}<//>
            ${item.loc && html`<p className="corto-gal-loc">${item.loc}<//>`}
            <a className="corto-gal-cta" href=${item.href}>
              Voir le projet complet →
            <//>
          <//>
        </div>
      `}
    <//>
  `;
}

// ─── Mount ───
function mount() {
  const container = document.createElement('div');
  container.id = 'corto-gal-mount';
  document.body.appendChild(container);
  createRoot(container).render(html`<${Gallery}/>`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
