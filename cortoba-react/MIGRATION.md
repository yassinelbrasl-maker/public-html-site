# Cortoba — Migration plan : vanilla → React (Option C full)

> Ce dossier contient la migration React + TypeScript du site
> cortobaarchitecture.com. **Pas encore en production.** Le `.htaccess` bloque
> tout accès public. Bascule quand satisfait — voir `deploy/DEPLOY.md`.

## Statut actuel

### Infrastructure

| Élément | Statut |
|---|---|
| Vite 5 + React 18 + TypeScript strict | ✅ |
| Tailwind CSS + tokens cortoba (bg / fg / gold) | ✅ |
| React Router avec code splitting (React.lazy × 17 chunks) | ✅ |
| Layout partagé (header, footer) | ✅ |
| i18n FR / EN / AR + RTL + `<html lang>` / `<body dir>` sync | ✅ |
| Auth context JWT via `/api/auth.php` + `apiFetch` helper | ✅ |
| Deploy playbook + `.htaccess` SPA fallback | ✅ |
| Décision SSR/SSG documentée | ✅ |

### Public-facing pages

| Page | Route | Statut |
|---|---|---|
| HomePage | `/` | ✅ Hero AnimatePresence, projets avec morph `layoutId`, services, teaser, about, team (fetch), contact (Formspree), map |
| Landscaping | `/landscaping` | ✅ Hero parallax (useScroll+useSpring), manifeste stats, projets, services, philosophie, approche, contact |
| ProjectDetailPage | `/projet-:slug` | ✅ Hero, meta grid, galerie + lightbox clavier, autres projets, next CTA |
| Configurateur | `/configurateur` | ✅ Intro, stepper, state, AnimatePresence mode="wait", **7 steps** (1 Projet, 2 Missions avec recherche+tags, 3 Fondations, 4 Identité, 5 Programme, 6 Terrain Leaflet+Nominatim, **Result avec calcul live**, Client, Success) |

### Settings admin — `/settings`

| Section | Statut |
|---|---|
| Login + shell + sidebar + auth | ✅ |
| Projets publiés (list live) | ✅ |
| Slider accueil (list + delete + live preview per slide) | ✅ |
| Projets paysagers (Landscaping) | ✅ |
| Slider héro Landscaping | ✅ |
| Paramètres généraux (contact + réseaux sociaux, save live) | ✅ |
| SEO & Méta (tabs par page, save live) | ✅ |

### Plateforme admin — `/plateforme/*`

| Section | Route | Statut |
|---|---|---|
| Shell + login + sidebar | `/plateforme/*` | ✅ |
| Projets | `/plateforme/projets` | ✅ |
| Demandes (leads du configurateur) | `/plateforme/demandes` | ✅ avec drawer détail + parse `cfg_data` |
| Suivi (tâches par projet) | `/plateforme/suivi` | ✅ |
| Rendement (dashboard équipe) | `/plateforme/rendement` | ✅ stats + bars animées |
| Livrables (filtres par statut) | `/plateforme/livrables` | ✅ |
| Dépenses (totaux par catégorie) | `/plateforme/depenses` | ✅ |
| Équipe (grid + drawer détail) | `/plateforme/equipe` | ✅ |
| Congés | `/plateforme/conges` | ✅ |
| Fiscal (calendrier avec en-retard/à venir/passées) | `/plateforme/fiscal` | ✅ |
| Flotte (véhicules avec badges d'expiration) | `/plateforme/flotte` | ✅ |

## Bundle stats (après npm run build)

```
index.html                     0.96 kB   │ gzip: 0.52 kB
Main bundle (home+landscaping)  372 kB   │ gzip: 120.9 kB  ← first paint
ConfiguratorPage (+ Leaflet)    199 kB   │ gzip: 59.2 kB   ← lazy
SettingsPage                     24 kB   │ gzip: 6.0 kB    ← lazy
ProjectDetailPage                7.8 kB  │ gzip: 2.67 kB   ← lazy
AuthContext                      1.7 kB  │ gzip: 0.91 kB   ← shared admin
14 plateforme/settings sections  2-6 kB  │ gzip: ~1-2 kB each ← lazy
```

## Reste à faire pour une vraie production

Chaque item ci-dessous est un "vrai travail de feature" qui ne peut pas
être fait en scaffolding. Ce sont des interactions spécifiques à porter
une à une.

### 🔴 Bloquants avant bascule
- [ ] **SSR ou SSG** (décision dans `deploy/SSR.md`) — sans ça, SEO dégradé
- [ ] **Upload d'images vers le NAS** via WebDAV pour : slider, landscaping
      slider, projets, projets paysagers
- [ ] **Modales d'édition** (CRUD complet) pour chaque section de contenu

### 🟡 Polish important
- [ ] **Drag-to-reorder** avec `Reorder.Group` (projets, slider, livrables)
- [ ] **Confirmation dialogs** réutilisables (actuellement `confirm()` natif)
- [ ] **Toast notifications** centralisées (actuellement inline par section)
- [ ] **Charts réels** (recharts) pour Rendement + Dépenses
- [ ] **Configurator step 5** — variantes avancées (chambres dynamiques,
      suite parentale variants, cuisine table, mixte niveaux, tous les
      équipements extérieurs du legacy)
- [ ] **Device switcher** dans Settings Projets (PC/Tablette/Mobile grid layouts)
- [ ] **Search global** (Cmd+K) dans la plateforme

### 🟢 Nice to have
- [ ] Tests E2E Playwright
- [ ] Export CSV/PDF pour Demandes, Dépenses, Rendement
- [ ] Notifications temps réel (server-sent events ?) pour chat + demandes
- [ ] PWA : offline support pour les pages publiques

## Commands

```bash
cd cortoba-react
export PATH="/c/Program Files/nodejs:$PATH"  # Windows
npm install    # une seule fois
npm run dev    # http://localhost:5173 avec proxy vers API prod
npm run build  # dist/
npm run preview  # http://localhost:4173 (sert dist/)
```

Tous les endpoints `/cortoba-plateforme/api/*` et `/img/*` sont proxyfiés
en dev (voir `vite.config.ts`). Les données réelles et les images
s'affichent immédiatement en mode dev.

## Conventions du projet

- **TypeScript strict** (`"strict": true`, `"noUnusedLocals": true`)
- **Alias `@/`** pour `./src/` (ex. `@/api/projects`)
- **Commentaires en français** pour matcher le public cible
- **Dark mode only** — pas de light mode (le site original est dark)
- **Animations** : framer-motion exclusivement (pas de framework d'animation concurrent)
- **API calls** : `apiFetch()` helper qui attache le Bearer token si présent
- **Éviter** TanStack Query / Redux / Zustand tant que Context + useReducer suffit

## Bascule en production

Voir `deploy/DEPLOY.md` — procédure step-by-step avec rollback.
Estimated downtime : < 30 secondes.
