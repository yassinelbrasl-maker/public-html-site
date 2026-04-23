# Cortoba — Migration React : **LIVE en production** ✅

> **La version React est en production sur cortobaarchitecture.com depuis
> le 2026-04-23.** Ce dossier contient le code source. Le build `dist/`
> est copié à la racine `public_html/` à chaque déploiement.
>
> Rollback d'urgence : `git checkout pre-spa-switch-20260423 -- .`
> puis commit + push. Le legacy HTML est dans `/_legacy/` (bloqué 403).

## Workflow de déploiement

```bash
cd cortoba-react
export PATH="/c/Program Files/nodejs:$PATH"

# Développement local (proxy API vers prod)
npm run dev      # http://localhost:5173

# Déployer en production
npm run deploy   # build + prerender + sitemap + copy dist → public_html
#                  puis git auto-commit + push déclenche le deploy cPanel
```

Le script `deploy` :
1. Compile TypeScript strict
2. Build Vite (code-split × 20+ chunks)
3. Prerender 8 snapshots HTML SEO (home, landscaping, configurateur, 5 projets)
4. Génère sitemap.xml + robots.txt
5. Copie `dist/*` vers `public_html/` (avec nettoyage des anciens hashes)

## Statut live

### Public-facing ✅

| URL | Statut |
|---|---|
| `/` (Home) | ✅ Hero AnimatePresence + projets layoutId + services + configurator teaser + about + team + contact + map |
| `/landscaping` | ✅ Hero parallax + manifeste + projets + services + philosophy + approche + contact |
| `/projet-:slug` | ✅ CatchAllPage routing (React Router ne supporte pas `projet-:slug`) + prerender SEO |
| `/configurateur` | ✅ 9 steps (intro + 1-6 + Result live calcul + Client submission + Success) |
| `/landscaping.html`, `/configurateur.html`, `/settings.html` | ✅ 301 → nouvelles URLs |
| `/sitemap.xml`, `/robots.txt` | ✅ |

### Settings admin ✅ — `/settings`

CRUD complet : Projets publiés, Slider accueil, Projets paysagers, Slider héro
Landscaping, Paramètres généraux, SEO & Méta. Chaque section = upload image NAS
+ editor modal + delete + drag-to-reorder + toast/confirm providers.

### Plateforme admin ✅ — `/plateforme/*`

11 sections toutes branchées sur les API PHP :
Demandes, Projets, Suivi, Rendement, Livrables, Dépenses, Équipe,
Congés, Fiscal, Flotte.

## Bundle stats

```
index.html (root)              ~1 kB   │ gzip: 0.5 kB
Main bundle                    ~390 kB │ gzip: 127 kB   ← first paint
ConfiguratorPage (+ Leaflet)   ~199 kB │ gzip: 59 kB    ← lazy
SettingsPage                    ~50 kB │ gzip: 12 kB    ← lazy
15+ admin sections              2-6 kB │ gzip: 1-2 kB each ← lazy
```

## Architecture

### State
- `useState` / `useReducer` local
- `useContext` pour : i18n, auth, configurator, toast, confirm

### Fetching
- `fetch` natif via `apiFetch()` (Bearer token auto)
- Upload via XMLHttpRequest (pour progress)

### Animations
- framer-motion exclusivement
- `<motion.*>` déclaratif + `AnimatePresence mode="wait"` + `layoutId` + `Reorder.Group`

### Code splitting
- `React.lazy` + `<Suspense>` sur toutes les routes sauf Home et Landscaping

### SEO
- `react-helmet-async` côté client (Googlebot)
- Prerender post-build pour les crawlers non-JS (Bing, LinkedIn, WhatsApp)

## Ce qui reste (polish post-flip, non bloquant)

### 🟡 Polish — tout terminé 2026-04-23
- [x] ~~Configurator Step 5 variantes legacy~~ — chambres dynamiques + suite
      parentale (dressing/placard) + cuisine avec table + bureau/sport/buanderie/cellier
- [x] ~~Charts pour Rendement + Dépenses~~ — donut (Dépenses) + horizontal bar (Rendement) via recharts
- [x] ~~Graphiques temporels~~ — évolution cumulée sur 30j / 90j / 1 an sur `DepensesSection` (AreaChart recharts avec toggle)
- [x] ~~Device switcher dans Settings Projets~~ — PC / Tablette / Mobile
- [x] ~~Drag-to-reposition visuel sur l'éditeur de slide~~ — pointer events sur la preview avec crosshair marker
- [x] ~~Variantes `cfg_mixte_niveaux` builder pour immeubles mixtes~~ — builder avec usage + surface par niveau, sommé dans calc
- [x] ~~`cfg_terrain_nature` `cfg_standing` `cfg_style` dans le résultat final~~ —
      multipliers intégrés au calc (STYLE_MULT, TERRAIN_MULT) + recap "Vos choix" en tête du résultat avec pourcentage d'impact
- [x] ~~Délai de réalisation~~ — estimé en mois (min/max) dans le résultat

### 🟢 Nice to have — tout terminé 2026-04-23
- [x] ~~Tests E2E Playwright~~ — 13 tests Chromium (smoke + admin + configurator)
- [x] ~~Export CSV~~ — Demandes, Dépenses, Rendement (bouton "📥 Exporter CSV" dans chaque section)
- [x] ~~Export PDF~~ — StepResult (devis client) via `window.print()` + feuille de style `@media print`
- [x] ~~Notifications temps réel pour demandes~~ — `useDemandesWatcher` poll 60s + toast + badge sidebar
- [x] ~~Global Cmd+K search~~ — CommandPalette (nav, demandes, projects, team)
- [x] ~~PWA offline~~ — manifest + service worker v2 (cache hashés, bypass admin)

### Ce qui reste vraiment ouvert (ne nécessite pas de code)
- Endpoints backend time-series pour Rendement (il n'existe pas de champ date sur les entrées actuelles)
- Intégrations tierces (chat WhatsApp, webhooks CRM) — à discuter selon usage réel
- Ajustements UX issus de l'utilisation quotidienne (à remonter au fil de l'eau)

## Conventions

- TypeScript strict
- Alias `@/` → `./src/`
- Commentaires en français
- Dark mode only
- Tailwind seulement

## Légalité & rollback

- **Backup tag** : `pre-spa-switch-20260423` (sur origin)
- **Backup code** : `cortoba-react/backups/site-snapshot-20260422.tar.gz`
- **Backup files** : `/_legacy/*.html` (bloqué 403 par `.htaccess`)
- **Backup .htaccess** : `/_legacy/.htaccess.pre-spa.bak`

Rollback en < 30 secondes :
```bash
git -C /path/to/public_html checkout pre-spa-switch-20260423 -- .
git -C /path/to/public_html commit -am "Revert SPA flip" && git push
```
