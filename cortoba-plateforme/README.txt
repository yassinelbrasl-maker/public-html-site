═══════════════════════════════════════════════════════════════════
  CORTOBA ATELIER — Installation sur cPanel
═══════════════════════════════════════════════════════════════════

ÉTAPE 1 — Créer la base de données
──────────────────────────────────
1. cPanel > MySQL Databases
2. Créer une nouvelle base : ex. dxmmmjkr_cortoba
3. Créer un utilisateur MySQL et son mot de passe
4. Associer l'utilisateur à la base (ALL PRIVILEGES)
5. phpMyAdmin > importer schema.sql (exécuter le contenu)

ÉTAPE 2 — Configurer les identifiants
─────────────────────────────────────
Ouvrir config/db.php et remplacer :
  - DB_NAME    : nom de votre base
  - DB_USER    : nom de l'utilisateur MySQL
  - DB_PASS    : mot de passe MySQL

ÉTAPE 3 — Uploader les fichiers
───────────────────────────────
Transférer tout le dossier cortoba_plateforme dans public_html/
(via File Manager ou FTP)

Structure attendue :
  public_html/
    cortoba_plateforme/
      plateforme.html    ← page d'accès
      install.php
      schema.sql
      .htaccess
      config/
        db.php
        middleware.php
      api/
        auth.php
        clients.php
        projets.php
        data.php

ÉTAPE 4 — Créer le compte admin
───────────────────────────────
1. Ouvrir dans le navigateur : https://votresite.com/cortoba_plateforme/install.php
2. Le compte admin sera créé :
   Email : corotbaarchitecture@gmail.com
   Mot de passe : Yassine2026
3. SUPPRIMER immédiatement install.php après (sécurité)

ÉTAPE 5 — Se connecter
──────────────────────
1. Aller sur https://votresite.com/cortoba_plateforme/plateforme.html
2. Se connecter avec :
   Email : corotbaarchitecture@gmail.com
   Mot de passe : Yassine2026

═══════════════════════════════════════════════════════════════════
  Sécurité : supprimez install.php après la première installation.
═══════════════════════════════════════════════════════════════════
