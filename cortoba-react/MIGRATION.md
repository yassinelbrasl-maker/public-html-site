# Cortoba — Migration plan : vanilla → React (Option C full)

> Ce dossier contient le squelette Vite + React + TypeScript de la future version
> du site. **Il n'est pas en production.** Le `.htaccess` bloque tout accès
> public. La migration se fait page par page, à votre rythme.

## Statut actuel

| Élément | Statut | Notes |
|---|---|---|
| Scaffolding Vite + React 18 + TS | ✅ | `package.json`, `vite.config.ts`, `tsconfig*` |
| Tailwind + tokens cortoba (bg/fg/gold) | ✅ | `tailwind.config.js`, `src/styles/globals.css` |
| React Router | ✅ | `src/router.tsx` |
| Layout partagé (header, footer, i18n stub) | ✅ | `src/layouts/RootLayout.tsx` |
| API client projets | ✅ | `src/api/projects.ts` |
| **Page d'accueil** (`/`) | 🟡 Partiel | Hero, projets (avec morph `layoutId`), services, teaser configurateur. Manque : about, team, contact, map Leaflet |
| Page landscaping (`/landscaping`) | ❌ | À porter |
| Page configurateur (`/configurateur`) | ❌ | 6 étapes + submission — gros morceau |
| Pages projets détail (`/projet-:slug`) | ❌ | Actuellement : fichiers HTML individuels `projet-*.html` |
| Panneau admin public (`/settings`) | ❌ | Currently `settings.html` |
| Plateforme admin (`/plateforme/*`) | ❌ | Le plus gros chunk : 10+ sections |

## Comment lancer en local

```bash
cd cortoba-react
npm install
npm run dev
# ouvre http://localhost:5173
```

Les endpoints PHP sont proxifiés vers cortobaarchitecture.com en dev
(voir `vite.config.ts`). Donc les données réelles s'affichent immédiatement.

## Comment builder et tester le build

```bash
npm run build       # produit dist/
npm run preview     # sert dist/ sur localhost:4173
```

## Comment déployer

**⚠ Ne pas déployer tant que toutes les pages critiques ne sont pas portées.**
La mise en production finale nécessitera :
1. Build de production : `npm run build` → `dist/`
2. Copier `dist/*` dans le site root (en remplaçant les `*.html` existants)
3. Mettre à jour `.htaccess` racine pour router toutes les URL vers `index.html`
   (fallback SPA), SAUF `/cortoba-plateforme/api/*` qui reste PHP
4. Pour le SEO : envisager Next.js ou `vite-ssg` pour pré-rendu statique

## Ordre recommandé pour porter les pages

Ordre du moins risqué au plus risqué :

1. **Landscaping** (risque faible, trafic modéré, pas d'interaction complexe)
2. **Project detail pages** (`/projet-:slug`) — liste simple, facile
3. **Home** (compléter les sections manquantes)
4. **Settings** (admin public content) — risque moyen, utilisé occasionnellement
5. **Configurateur** (risque élevé — c'est le tunnel de leads) — prévoir
   une campagne de tests avant de basculer
6. **Plateforme admin** (risque élevé — votre outil quotidien) — à faire
   en dernier, sur un sous-domaine de test

## Patterns à réutiliser entre pages

- **Entrances** : voir `HeroSlider.tsx` — `initial/animate` avec `delay`
- **Scroll-reveal** : voir `ProjectsSection.tsx` — `whileInView` avec `viewport={{ once: true }}`
- **Shared-element morph** : voir `ProjectCard.tsx` + `ProjectDetailOverlay.tsx`
  avec `layoutId` identique sur la source et la cible
- **Hover** : `whileHover={{ y: -4 }}` pour soulever une carte
- **Forms** : utiliser `react-hook-form` + `zod` (installés dans `package.json`)
- **Auth** (pour plateforme/admin) : créer un `AuthContext` avec les sessions PHP existantes

## Décisions à prendre plus tard

- **SSR / SSG** : Next.js vs vite-ssg — à choisir avant que le SEO soit critique
- **UI kit** : continuer Tailwind seul, ou ajouter shadcn/ui pour les composants admin ?
- **State global** : Zustand (recommandé, simple) ou Redux ou Context ?
- **Fetching** : TanStack Query (recommandé) ou SWR ou fetch nu ?

## Pour un dev IA ou humain qui reprend le projet

Tout ce qu'il faut savoir est dans :
- `vite.config.ts` — proxy dev
- `src/router.tsx` — routes à ajouter au fil des ports
- `src/api/projects.ts` — exemple de contrat d'API client (copier le pattern
  pour chaque endpoint PHP)
- `src/components/ProjectCard.tsx` + `ProjectDetailOverlay.tsx` — pattern
  framer-motion avec `layoutId`
