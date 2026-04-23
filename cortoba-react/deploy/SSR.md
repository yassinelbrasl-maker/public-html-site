# SSR / SSG — décision architecturale

L'app actuelle est une **SPA pure** (Vite + React + client-side rendering).
Sans modification, le HTML servi est quasi vide et le contenu n'apparaît
qu'après le download + parse du bundle JS (~120 kB gz sur la home).

C'est le seul trou dans l'architecture React par rapport au site PHP actuel
(dont le HTML est toujours complet, rendu serveur, immédiatement indexable).

## Pourquoi ça compte pour cortobaarchitecture.com

Le site rank sur "architecture Djerba", "architecte Tunisie", etc.
Ces visites SEO représentent une part significative des leads. Une perte
de ranking pendant ou après la migration = leads perdus = revenus perdus.

Trois crawlers importants pour ce cas :

| Crawler | Rend JS ? | Notes |
|---|---|---|
| Googlebot | Oui mais en 2e passe | Indexation lente, Core Web Vitals dégradés |
| Bingbot | Partiellement | SEO pénalisé |
| LinkedIn / WhatsApp / Twitter preview | Non | Lors du partage d'une page, le preview est vide |

## Options à considérer (dans l'ordre de recommandation)

### Option A — **Next.js 14 App Router**
Migration : rewrite incrémentiel de ce scaffold Vite en Next.js.

✅ Le framework React le plus mature pour le rendu serveur
✅ Server Components = pas de code shipped au client pour les pages statiques
✅ File-based routing (remplace React Router)
✅ Écosystème énorme, doc exhaustive
✅ ISR (Incremental Static Regeneration) pour les pages de projets publiés

❌ Changement de framework → 1-2 semaines de boulot supplémentaire
❌ Héberger un Node.js en production (cPanel/mutualisé ne suffit plus).
   Options : Vercel (facile, gratuit jusqu'à un certain seuil), ou VPS perso.
❌ Impact sur le workflow (build + déploiement Next.js ≠ fichiers statiques)

**Recommandé si** : vous êtes prêt à changer de plan d'hébergement ET à
apprendre Next.js. C'est la meilleure solution long terme.

### Option B — **vite-ssg** (prerender au build)
Reste avec Vite, ajoute `vite-ssg` ou `vite-plugin-ssr`. Au moment du build,
Vite génère un HTML statique pour chaque route (comme Jekyll/Hugo).

✅ Aucun changement d'hébergement — toujours des fichiers statiques
✅ Reste du code React identique
✅ SEO résolu : chaque route a son HTML pré-rendu
✅ Plus rapide que SSR serveur (pas de CPU au runtime)

❌ Ne marche que pour les routes qu'on connaît au build :
   - `/`, `/landscaping`, `/configurateur`, `/settings`, `/plateforme` ✓
   - `/projet-:slug` → il faut lister tous les slugs au build (fetch depuis l'API)
   - Le contenu dynamique (liste projets fetchée) reste hydraté côté client
❌ Ne marche pas pour les pages authentifiées (`/plateforme/*`) — mais
   on ne veut pas qu'elles soient indexables de toute façon

**Recommandé si** : vous voulez le SEO sans changer d'hébergement. C'est
la voie la moins disruptive par rapport à votre workflow actuel.

### Option C — **Rien, rester SPA**
Accepter que le SEO prenne un coup pendant quelques mois.

✅ Le plus simple, migration déjà faite
❌ Risque SEO réel et mesurable
❌ Preview sur réseaux sociaux cassé (cortoba se partage souvent en WhatsApp
   pour les clients)

**Recommandé si** : votre trafic SEO est négligeable (pas le cas) OU
vous acceptez de perdre 3-6 mois de ranking.

## Recommandation

Pour le contexte cortobaarchitecture.com : **Option B (vite-ssg)** ou
**Option A (Next.js)**. Ne pas faire Option C.

L'option B demande environ **3-5 jours** de travail supplémentaire :
1. `npm install vite-ssg` et configuration
2. Adapter les imports (certaines libs ne fonctionnent pas côté SSR)
3. Écrire une fonction qui liste les slugs au build (fetch API + cache)
4. Adapter `main.tsx` pour utiliser l'entry point de vite-ssg
5. Tester chaque route en mode prerender
6. Vérifier les meta tags par route avec `react-helmet-async`

L'option A demande environ **2-3 semaines** — plus long mais plus propre
long terme.

## Points de code impactés

Quelque soit le choix :
- `main.tsx` : change d'entry point
- Les composants qui utilisent `window`, `localStorage`, `document` doivent
  être gardés côté client (déjà OK si on utilise bien `useEffect`)
- `react-leaflet` ne fonctionne pas en SSR — lazy-load uniquement côté client
  (déjà le cas avec `lazy()` sur ConfiguratorPage)
- `I18nProvider` : l'initial locale vient de `navigator.language` → lire
  depuis cookie ou header `Accept-Language` côté serveur pour le SSR

## Décision à documenter

Une fois la décision prise, mettre à jour `../MIGRATION.md` avec :
- Le choix retenu
- La date de décision
- Qui a tranché
