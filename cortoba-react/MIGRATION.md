# Cortoba — Migration plan : vanilla → React (Option C full)

> Ce dossier contient le squelette Vite + React + TypeScript de la future version
> du site. **Il n'est pas en production.** Le `.htaccess` bloque tout accès
> public. La bascule se fait quand TOUTES les pages critiques sont portées.

## Statut actuel

| Élément | Statut | Notes |
|---|---|---|
| Scaffolding Vite + React 18 + TS strict | ✅ | `package.json`, `vite.config.ts`, `tsconfig*` |
| Tailwind + tokens cortoba | ✅ | `tailwind.config.js`, `src/styles/globals.css` |
| React Router avec code splitting (React.lazy) | ✅ | `src/router.tsx` — 12 chunks lazy |
| Layout partagé (header, footer) | ✅ | `src/layouts/RootLayout.tsx` |
| **i18n FR / EN / AR + RTL** | ✅ | `src/i18n/` — provider, dictionnaires, body `.rtl` switch |
| Auth context JWT via /api/auth.php | ✅ | `src/auth/AuthContext.tsx` + `apiFetch` helper |
| **Page d'accueil** (`/`) | ✅ | Hero avec AnimatePresence, projets avec morph `layoutId`, services, teaser, about, team (fetch), contact (Formspree), map Google embed |
| **Page landscaping** (`/landscaping`) | ✅ | Hero parallax (`useScroll`+`useSpring`), manifeste avec stats, projets, services, philosophie, approche, contact |
| **Pages projets détail** (`/projet-:slug`) | ✅ | Hero, meta grid, galerie + lightbox avec nav clavier, autres projets, next CTA |
| **Configurateur** (`/configurateur`) | ✅ | Intro, stepper, state (Context+reducer), validation, AnimatePresence mode="wait", tous les steps : **1 Projet, 2 Missions (42 missions, 10 catégories, recherche, tags selected), 3 Fondations, 4 Identité, 5 Programme (simplifié), 6 Terrain (Leaflet + Nominatim), Client, Success** |
| **Settings** public admin (`/settings`) | 🟡 | Shell avec login, sidebar, crossfade sections. Section Projets publiés fonctionnelle (list live). 5 autres sections en placeholders informatifs. |
| **Plateforme** admin (`/plateforme/*`) | 🟡 | Shell avec login, sidebar 10 sections, routes imbriquées. **Demandes** fonctionnelle (list live + drawer détail avec parse `cfg_data`). 9 autres sections en placeholders informatifs. |
| Deploy playbook | ✅ | `deploy/DEPLOY.md` — étapes step-by-step + rollback |
| `.htaccess` production | ✅ | `deploy/htaccess-production.txt` — SPA fallback + cache headers |
| Décision SSR/SSG | ✅ Documentée | `deploy/SSR.md` — recommande Option B (vite-ssg) ou A (Next.js) |

## Ce qui reste à faire (estimé)

| Chunk | Effort | Notes |
|---|---|---|
| Settings : 5 sections (slider, ls-projects, ls-slider, general, seo) | 1-2 semaines | Chacune = CRUD + upload image + positioning |
| Plateforme : 9 sections restantes | 4-6 semaines | Chacune est une mini-app (rendement = graphiques, depenses = journal + templates, flotte = liste + entretien, etc.) |
| Configurator Step 5 : variantes avancées (chambres dynamiques, suite parentale, cuisine table, mixte niveaux) | 2-3 jours | UX riche du legacy à reproduire |
| Configurator : result page (après step 6, avant client) avec calcul de surface/budget | 3-5 jours | Porter `cfgCalculate()` + règles de calcul |
| Implémentation SSR/SSG (décision dans SSR.md) | 3 jours à 3 semaines | Dépend du choix Option A/B |
| Bascule `.htaccess` + deploy | 1 jour | Voir DEPLOY.md |
| Tests E2E (Playwright ?) | 3-5 jours | Test configurator submit, settings login, plateforme login |

**Total remaining estimate : 6-12 semaines** (était 14-22 initialement).

## Commands

```bash
cd cortoba-react

# PATH (Windows)
export PATH="/c/Program Files/nodejs:$PATH"

npm install       # une seule fois
npm run dev       # http://localhost:5173 (proxy vers API prod)
npm run build     # dist/
npm run preview   # http://localhost:4173 (sert dist/)
```

Les endpoints `/cortoba-plateforme/api/*` et `/img/*` sont proxyfiés
en dev vers cortobaarchitecture.com (voir `vite.config.ts`), donc les
données réelles et les images s'affichent immédiatement en dev.

## Architecture retenue

### State management
- `useState` / `useReducer` pour l'UI locale
- `useContext` pour : i18n, auth, configurator state
- Pas de librairie externe (Zustand / Redux) — pas nécessaire à ce niveau de complexité

### Fetching
- `fetch` natif via `apiFetch()` helper (attache Bearer token auto)
- Pas de TanStack Query pour l'instant — si les besoins de cache croissent, l'ajouter

### Forms
- Pour les petits formulaires (contact, login) : `useState` + validation inline
- Pour le configurateur : reducer pattern dédié
- `react-hook-form` + `zod` installés, pas encore utilisés — à sortir si un form complexe apparaît

### Animations
- `framer-motion` exclusivement
- Pattern : `initial` / `animate` / `exit` / `whileInView` / `whileHover`
- `AnimatePresence mode="wait"` pour les transitions entre pages/steps
- `layoutId` pour les shared-element morphs (galerie projets)
- Code-split pour éviter le coût sur la page d'accueil

### Code splitting
- `React.lazy` sur toutes les routes sauf Home et Landscaping
- 12 chunks finaux — le main ne pèse que 120 kB gz
- Leaflet (~180 kB) n'est téléchargé que si l'utilisateur arrive au Step 6

## Architecture à éventuellement ajouter

- **TanStack Query** si on a beaucoup d'endpoints avec revalidation
- **Zustand** si le state contextuel grossit (pour l'instant pas nécessaire)
- **shadcn/ui** si l'admin a besoin de beaucoup de composants (Dialog,
  Dropdown, Select, Tooltip, Toast) — pour l'instant tout est fait main
- **react-hook-form + zod** quand le configurateur aura une result page avec
  recalcul live (pour éviter les re-renders)

## Conventions

- TypeScript strict (`"strict": true`, `"noUnusedLocals": true`)
- Chemins absolus via alias `@/` (ex. `@/api/projects`)
- Commentaires en français pour matcher le public cible et le legacy
- Dark mode exclusif (on n'implémente pas de light mode — le site original
  est dark uniquement)
- Pas de 3rd party CSS framework en plus de Tailwind
