# Cortoba — Migration plan : vanilla → React (Option C full)

> Ce dossier contient la migration React + TypeScript du site
> cortobaarchitecture.com. **Pas encore en production.** Le `.htaccess` bloque
> tout accès public. Bascule quand satisfait — voir `deploy/DEPLOY.md`.

## Statut actuel

### Infrastructure ✅

| Élément | Statut |
|---|---|
| Vite 5 + React 18 + TypeScript strict | ✅ |
| Tailwind CSS + tokens cortoba (bg / fg / gold) | ✅ |
| React Router avec code splitting (React.lazy × 20+ chunks) | ✅ |
| Layout partagé (header, footer) | ✅ |
| **i18n FR / EN / AR + RTL** + body `.rtl` switch | ✅ |
| Auth context JWT via `/api/auth.php` + `apiFetch` helper | ✅ |
| **Toast notifications** (non-blocking, `useToast()`) | ✅ |
| **Confirm dialogs** réutilisables (`useConfirm()`, remplace `window.confirm`) | ✅ |
| **Modal** réutilisable avec AnimatePresence + focus trap | ✅ |
| **ImageUploader** réutilisable (drag-drop, progress XHR, preview) | ✅ |
| **SEO per-route** via react-helmet-async + `<Seo>` component | ✅ |
| **Build-time SEO prerender** (8 routes statiques HTML avec meta tags pour crawlers) | ✅ |
| **sitemap.xml + robots.txt** auto-générés au build | ✅ |
| Deploy playbook + `.htaccess` SPA fallback avec prerender | ✅ |

### Public-facing pages ✅

| Page | Route | Statut |
|---|---|---|
| HomePage | `/` | ✅ Seo + Hero AnimatePresence + projets layoutId + services + teaser + about + team + contact + map |
| Landscaping | `/landscaping` | ✅ Seo + Hero parallax + manifeste + projets + services + philosophy + approche + contact |
| ProjectDetailPage | `/projet-:slug` | ✅ Seo dynamique + hero + meta + galerie + lightbox + related projects + next CTA |
| Configurateur | `/configurateur` | ✅ Intro + stepper + 9 steps avec AnimatePresence cross-fade |

### Configurator — 9/9 steps ✅

| Step | État |
|---|---|
| Intro banner | ✅ |
| 1. Projet (nom) | ✅ |
| 2. Missions (10 cats, 42 missions, recherche, tags) | ✅ |
| 3. Fondations (types, opération, terrain, budget) | ✅ |
| 4. Identité (styles + standing avec tooltips) | ✅ |
| 5. Programme (simplifié — compteurs + toggles) | 🟡 |
| 6. Terrain (Leaflet + Nominatim, marker draggable, coords GPS) | ✅ |
| **Result** (calcul live coût + surface + décomposition) | ✅ |
| Client (formulaire + submission) | ✅ |
| Success | ✅ |

### Settings admin ✅ — `/settings`

| Section | CRUD | Notes |
|---|---|---|
| Login + shell + auth | ✅ | |
| Projets publiés | ✅ Create / Edit / Delete / Reorder | Upload hero + galerie vers NAS, toast + confirm |
| Slider accueil | ✅ Create / Edit / Delete / Reorder | Éditeur complet (position / zoom / animation / fit / alt) |
| Projets paysagers | ✅ Create / Edit / Delete / Reorder | |
| Slider héro Landscaping | 🟡 Create + list | TODO : éditeur modal et reorder |
| Paramètres généraux | ✅ | Contact + réseaux sociaux, POST `data.php` |
| SEO & Méta | ✅ | Tabs par page, POST `data.php` |

### Plateforme admin ✅ — `/plateforme/*`

| Section | Route | Statut |
|---|---|---|
| Shell + login + sidebar | `/plateforme/*` | ✅ |
| Demandes (leads du configurateur) | `/plateforme/demandes` | ✅ Table + drawer détail + parse `cfg_data` |
| Projets | `/plateforme/projets` | ✅ Cards + progress bars + filters |
| Suivi (tâches par projet) | `/plateforme/suivi` | ✅ Groupées par projet + progress |
| Rendement (dashboard équipe) | `/plateforme/rendement` | ✅ Stats + bars animées par membre |
| Livrables | `/plateforme/livrables` | ✅ Table + filter par statut + status pills |
| Dépenses | `/plateforme/depenses` | ✅ Table + totaux par catégorie |
| Équipe | `/plateforme/equipe` | ✅ Grid + drawer détail avec modules |
| Congés | `/plateforme/conges` | ✅ Table + status pills |
| Fiscal | `/plateforme/fiscal` | ✅ Grouped (en-retard / à venir / passées) |
| Flotte | `/plateforme/flotte` | ✅ Cards + badges d'expiration |

## Bundle stats (après `npm run build`)

```
index.html (root)              0.97 kB │ gzip: 0.53 kB
Main bundle (home+landscaping)  391 kB  │ gzip: 127 kB   ← first paint
ConfiguratorPage (+ Leaflet)    199 kB  │ gzip: 59 kB    ← lazy
SettingsPage                     49 kB  │ gzip: 12 kB    ← lazy
ProjectDetailPage                8 kB   │ gzip: 3 kB     ← lazy
15+ admin sections               2-6 kB │ gzip: 1-2 kB each ← lazy
AuthContext shared               2 kB   │ gzip: 0.9 kB
```

**Prerendered static HTML** at build time : 8 routes
(`/`, `/landscaping`, `/configurateur`, `/projet-*` × 5) — crawlers see
meta tags immediately without needing JS execution.

## Reste à faire pour la bascule en production

### 🔴 À évaluer avant la bascule
- [x] ~~SSG pour SEO~~ — ✅ solution hybride : prerender HTML meta + SPA hydration
- [x] ~~Upload images~~ — ✅ fonctionnel via `upload_project_image.php`
- [x] ~~Modal edit dialogs~~ — ✅ pattern en place + slider + projets + ls projets
- [x] ~~Confirm & toast~~ — ✅ providers + hooks + wired
- [ ] **Bascule réelle** : exécuter `deploy/DEPLOY.md`, vérifier la prod

### 🟡 Polish important (post-bascule)
- [ ] Slider héro Landscaping : éditeur modal + reorder (même pattern que slider accueil)
- [ ] Configurator Step 5 : variantes legacy (chambres dynamiques avec config par chambre,
      suite parentale dressing/placard, cuisine avec table, mixte niveaux builder,
      garages 1/2 voitures, équipements extérieurs détaillés)
- [ ] Charts temporels pour Rendement + Dépenses (recharts au choix)
- [ ] Device switcher dans Settings Projets (PC/Tablette/Mobile grid layouts)
- [ ] Remplacer les derniers `alert()` par `useToast()`
- [ ] Drag-to-reposition visuel sur l'éditeur de slide (actuellement sliders X/Y)

### 🟢 Nice to have
- [ ] Tests E2E Playwright (flow configurator submit, settings CRUD, plateforme login)
- [ ] Export CSV/PDF (Demandes, Dépenses, Rendement)
- [ ] Notifications temps réel (SSE ?) pour chat + demandes
- [ ] Global Cmd+K search dans la plateforme
- [ ] PWA offline pour les pages publiques

## Commands

```bash
cd cortoba-react
export PATH="/c/Program Files/nodejs:$PATH"  # Windows
npm install    # une seule fois
npm run dev    # http://localhost:5173 avec proxy vers API prod
npm run build  # dist/ + prerender SEO + sitemap + robots
npm run build:nose  # variante sans prerender (debug plus rapide)
npm run preview  # http://localhost:4173 sert dist/
```

## Architecture retenue

### State management
- `useState` / `useReducer` pour l'UI locale
- `useContext` pour : i18n, auth, configurator state, toast, confirm
- Pas de librairie externe (Zustand / Redux)

### Fetching
- `fetch` natif via `apiFetch()` helper (attache Bearer token auto)
- Upload images via XMLHttpRequest pour avoir la progress

### UI patterns
- Modal réutilisable pour tout CRUD (éditeur projet, slide, confirmation)
- framer-motion exclusivement pour animations
- Reorder.Group pour drag-to-reorder
- AnimatePresence mode="wait" pour transitions entre pages/steps
- layoutId pour shared-element morphs

### Code splitting
- `React.lazy` sur toutes les routes sauf Home et Landscaping
- 20+ chunks finaux — main bundle 127 kB gz
- Leaflet (~180 kB) chargé uniquement au Step 6 du configurateur

## Conventions

- TypeScript strict (`"strict": true`, `"noUnusedLocals": true`)
- Alias `@/` → `./src/`
- Commentaires en français (public cible)
- Dark mode exclusif
- Tailwind seulement (pas d'autre framework CSS)

## Bascule en production

Voir `deploy/DEPLOY.md` — procédure step-by-step avec rollback instantané.
Voir `deploy/SSR.md` pour les options SSR/SSG avancées si on veut dépasser
le prerender HTML simple.
