# Deploy playbook — bascule vers la version React

> ⚠ **Ne pas exécuter tant que les pages critiques ne sont pas toutes portées**
> (configurateur complet, settings complet, plateforme complète).
> Voir `../MIGRATION.md` pour le statut exact.

## Avant toute bascule

1. Prendre un backup fraîchement tagué du site actuel :
   ```bash
   git -C E:/public_html/public_html tag -a pre-spa-switch-$(date +%Y%m%d) \
       -m "Dernier état avant bascule SPA" HEAD
   git push origin --tags
   ```

2. Prendre un dump SQL de la base de production. Les endpoints PHP ne
   changent pas mais on ne veut aucune surprise.

3. Vérifier que la build React tourne proprement :
   ```bash
   cd cortoba-react
   npm install
   npm run build
   npm run preview   # http://localhost:4173 — tour complet des pages
   ```

## Bascule SPA (étape par étape)

### 1. Build de production

```bash
cd cortoba-react
npm run build
# Produit dist/index.html + dist/assets/*.{js,css,woff2}
```

### 2. Sauvegarder l'ancien site

Ne pas effacer l'ancien HTML brutalement — le déplacer en `_legacy/` :

```bash
cd E:/public_html/public_html
mkdir -p _legacy
mv index.html landscaping.html configurateur.html settings.html _legacy/
# projet-*.html si présents sur le serveur
mv projet-*.html _legacy/ 2>/dev/null || true
```

### 3. Copier la build

```bash
cp -r cortoba-react/dist/index.html .
cp -r cortoba-react/dist/assets .
```

### 4. Swap le .htaccess

```bash
cp .htaccess .htaccess.pre-spa.bak
cp cortoba-react/deploy/htaccess-production.txt .htaccess
```

### 5. Vérifier immédiatement

- https://cortobaarchitecture.com/ → doit charger la Home React
- https://cortobaarchitecture.com/configurateur → doit charger le configurateur
- https://cortobaarchitecture.com/cortoba-plateforme/api/published_projects.php →
  doit renvoyer du JSON (signe que les API ne sont pas cassées par le fallback)
- https://cortobaarchitecture.com/projet-villa-al (exemple) → React Router
  doit afficher la ProjectDetailPage

### 6. En cas de problème : rollback instantané

```bash
cd E:/public_html/public_html
rm index.html
rm -rf assets
mv _legacy/*.html .
cp .htaccess.pre-spa.bak .htaccess
```

Site retour à la version PHP/HTML en < 30 secondes.

## SEO — check post-bascule

Sans SSR, les crawlers voient un HTML vide + un `<div id="root"></div>`.
Google indexe quand même (rendu JS) mais :

- Les autres crawlers (Bing, DuckDuckGo, LinkedIn preview) peuvent échouer
- Le premier rendu prend 1-3s, pénalisant pour le Core Web Vitals
- Les meta OpenGraph ne changent pas par route

**Décision à prendre AVANT la bascule** : lire `SSR.md` dans ce dossier
et choisir entre (a) Next.js migration, (b) vite-ssg prerender,
(c) accepter le SPA sans SSR (option moins bonne mais possible si le site
a déjà une autorité SEO forte).

## Après la bascule

- Supprimer `cortoba-react/.htaccess` Require-denied (actuellement bloque
  l'accès direct au dossier en HTTP ; inutile une fois la build copiée)
- Supprimer `_legacy/*.html` après 2-4 semaines si aucun problème remonté
- Mettre à jour la documentation interne (cortoba-platform skill)
- Retirer le dossier `cortoba-react/` de l'auto-deploy (le code source peut
  vivre dans un repo séparé `cortoba-web-frontend/` par ex.)
