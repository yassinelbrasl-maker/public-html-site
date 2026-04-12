# Plan de correction : texte qui deborde du conteneur sur mobile - landscaping.html

## Contexte

Le fichier landscaping.html contient tout le CSS en inline (balise style) dans le head. Le site utilise une mise en page CSS Grid et Flexbox avec trois breakpoints responsives : 1024px, 768px et 480px. Plusieurs sections utilisent des largeurs fixes, des gaps larges et des paddings en vw qui ne sont pas suffisamment adaptes aux petits ecrans, ce qui provoque un debordement du texte hors de son conteneur sur mobile.

---

## Etapes detaillees

### 1. Lire et analyser le fichier source

- Ouvrir landscaping.html a la racine du projet.
- Identifier toutes les sections susceptibles de provoquer un debordement sur mobile :
  - Hero (.hero, .hero-content, .hero-title)
  - Manifeste (.manifeste, .manifeste-title, .manifeste-text)
  - Projets mosaic (.projects-mosaic, .section-header)
  - Services (.services-grid, .service-card)
  - Philosophie (.philosophy-quote, .philosophy-author)
  - Approche (.approche-section, .approche-step)
  - Contact (.contact-section, .contact-links)
  - Footer (footer, .footer-links)
  - Navbar (.navbar, .nav-arch-btn)

### 2. Identifier les causes racines du debordement

Les problemes identifies dans le CSS actuel sont :

1. .hero padding fixe : padding 0 0 5rem 5vw -- pas de padding droit, le contenu peut toucher ou depasser le bord droit.
2. .hero-content max-width 680px sans overflow-wrap -- les longs mots ou titres avec clamp() peuvent depasser sur petit ecran.
3. .manifeste gap 8rem et padding 9rem 5vw -- le gap de 8rem est excessif sur mobile meme si la grille passe en 1 colonne a 1024px.
4. .manifeste-title utilise clamp(2rem, 4vw, 3.2rem) qui est correct, mais il manque overflow-wrap: break-word pour les mots longs.
5. .projects-mosaic padding 0 5vw -- correct sur desktop, mais les images/cartes a largeur fixe peuvent depasser.
6. .services-section padding 9rem 5vw et max-width 1300px -- pas de overflow hidden sur le conteneur.
7. .philosophy-bg font-size 22vw avec white-space nowrap -- le mot en arriere-plan peut creer un scroll horizontal.
8. .approche-section gap 8rem et grid 1fr 1fr -- a 1024px passe en 1 colonne, mais le gap reste trop grand.
9. .contact-links display flex -- pas assez protege contre le debordement des boutons CTA sur petit ecran.
10. footer display flex avec justify-content space-between -- peut etaler les elements au-dela du viewport.
11. .section-header display flex avec justify-content space-between -- titre et lien cote a cote poussent le contenu hors ecran.
12. body a overflow-x hidden (ligne 37) -- present mais pas sur html, ce qui peut ne pas suffire.
13. .approche-num font-size 2.8rem dans le flex de .approche-step -- avec le gap de 1.8rem, pousse le texte hors du conteneur.
14. .hero-title font-size clamp(2.8rem, 7vw, 6rem) -- potentiellement trop large a certaines tailles intermediaires.

### 3. Ajouter un filet de securite global contre le debordement horizontal

En haut du CSS (juste apres le reset a la ligne 27), ajouter :

```css
html, body {
  overflow-x: hidden;
  max-width: 100vw;
}

img, video, svg, iframe {
  max-width: 100%;
  height: auto;
}
```

Cela garantit que aucun element ne peut provoquer de scroll horizontal.

### 4. Ajouter overflow-wrap aux conteneurs de texte dans les styles de base

Apres les styles de body (vers la ligne 38), ajouter :

```css
.hero-content,
.manifeste-text,
.service-desc,
.approche-step-desc,
.contact-sub,
.philosophy-quote,
.hero-desc {
  overflow-wrap: break-word;
  word-break: break-word;
}
```

Cela force le retour a la ligne pour les mots longs en francais qui pourraient depasser le conteneur.

### 5. Corriger les styles dans le breakpoint @media (max-width: 768px)

Editer la section @media (max-width: 768px) (ligne 867) pour REMPLACER et AJOUTER les regles suivantes :

```css
@media (max-width: 768px) {
  /* MODIFIER - ajouter un padding droit au hero */
  .hero { padding: 0 5vw 4rem 5vw; }

  /* GARDER existant */
  .projects-mosaic {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 260px 200px 200px;
  }
  .proj-card:nth-child(1) { grid-row: span 1; grid-column: span 2; }
  .proj-card:nth-child(4) { grid-column: span 1; }
  .proj-overlay { opacity: 1; }
  .services-grid { grid-template-columns: 1fr; }
  .service-card { border-right: none; }
  .navbar { padding: 0 1.4rem; }
  .hero-indicators { display: none; }

  /* AJOUTS pour corriger le debordement */
  .hero-content { max-width: 100%; }
  .manifeste { padding: 4rem 5vw; gap: 3rem; }
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  .approche-section { padding: 4rem 5vw; gap: 3rem; }
  .approche-num { font-size: 2rem; min-width: 2rem; }
  .approche-step { gap: 1.2rem; }
  .philosophy-section { padding: 5rem 5vw; overflow: hidden; }
  .contact-section { padding: 5rem 5vw; }
  footer {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}
```

### 6. Corriger les styles dans le breakpoint @media (max-width: 480px)

Editer la section @media (max-width: 480px) (ligne 882) pour AJOUTER a existant :

```css
@media (max-width: 480px) {
  /* GARDER existant */
  .projects-mosaic { grid-template-columns: 1fr; grid-template-rows: auto; }
  .proj-card { height: 240px; }
  .proj-card:nth-child(1) { grid-column: span 1; }
  .proj-card:nth-child(4) { grid-column: span 1; }

  /* AJOUTS */
  .hero { padding: 0 4vw 3rem 4vw; }
  .hero-title { font-size: clamp(1.8rem, 8vw, 2.5rem); }
  .hero-desc { font-size: 0.85rem; max-width: 100%; }
  .manifeste { padding: 3rem 4vw; gap: 2rem; }
  .manifeste-title { font-size: clamp(1.6rem, 6vw, 2.2rem); }
  .service-card { padding: 2rem 1.2rem; }
  .approche-section { padding: 3rem 4vw; }
  .approche-step { flex-direction: column; gap: 0.6rem; }
  .approche-num { font-size: 1.6rem; }
  .contact-links { flex-direction: column; align-items: center; }
  .contact-link { width: 100%; justify-content: center; }
  .footer-links { flex-direction: column; gap: 1rem; align-items: center; }
}
```

### 7. Verifier la meta viewport

- Confirmer que la balise meta viewport avec width=device-width, initial-scale=1.0 est bien presente (ligne 5 du fichier) -- elle est deja la, aucune action requise.

### 8. Tester les corrections

- Ouvrir le fichier dans un navigateur.
- Utiliser les DevTools (F12) puis le mode responsive pour tester aux largeurs suivantes :
  - 1024px (tablette paysage) -- verifier la grille manifeste et services
  - 768px (tablette portrait) -- verifier hero, section-header, footer
  - 480px (mobile courant) -- verifier toutes les sections
  - 375px (iPhone SE) -- cas le plus contraint
  - 320px (tres petit ecran) -- cas extreme
- Pour chaque largeur, verifier que :
  - Aucun scroll horizontal ne apparait (pas de barre de defilement en bas).
  - Le texte reste dans son conteneur visible.
  - Les titres, paragraphes, boutons et grilles se adaptent correctement.
  - La lisibilite est preservee (taille de police suffisante).
  - Les boutons CTA (contact) sont utilisables au doigt (minimum 44px de hauteur).

### 9. Creer un commit Git

- git add landscaping.html
- Message de commit : Fix mobile text overflow on landscaping page by adding responsive constraints and word-break rules
- Ne PAS pousser vers le remote sans confirmation.

---

## Resume des fichiers concernes

| Fichier | Action |
|---------|--------|
| landscaping.html | Modifier les styles inline -- ajouter regles globales, enrichir les media queries 768px et 480px |

Aucun autre fichier CSS externe est concerne car tout le CSS de cette page est embarque directement dans le HTML via la balise style.
