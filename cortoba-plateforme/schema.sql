-- ============================================================
--  CORTOBA ATELIER — Schéma de base de données
--  Exécuter dans phpMyAdmin (cPanel) après création de la BDD
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Comptes utilisateurs
CREATE TABLE IF NOT EXISTS `CA_accounts` (
  `id` varchar(32) NOT NULL,
  `email` varchar(180) NOT NULL,
  `name` varchar(120) NOT NULL,
  `role` varchar(30) NOT NULL DEFAULT 'membre',
  `password` varchar(255) NOT NULL,
  `approved` tinyint(1) NOT NULL DEFAULT 0,
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clients
CREATE TABLE IF NOT EXISTS `CA_clients` (
  `id` varchar(32) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `num_client` int DEFAULT NULL,
  `type` enum('physique','morale') NOT NULL DEFAULT 'physique',
  `prenom` varchar(80) DEFAULT NULL,
  `nom` varchar(80) DEFAULT NULL,
  `raison` varchar(200) DEFAULT NULL,
  `matricule` varchar(80) DEFAULT NULL,
  `display_nom` varchar(200) NOT NULL,
  `email` varchar(180) DEFAULT NULL,
  `tel` varchar(40) DEFAULT NULL,
  `whatsapp` varchar(40) DEFAULT NULL,
  `adresse` text,
  `statut` varchar(40) DEFAULT 'Prospect',
  `source` varchar(80) DEFAULT NULL,
  `source_detail` varchar(200) DEFAULT NULL,
  `date_contact` date DEFAULT NULL,
  `remarques` text,
  `projets` int DEFAULT 0,
  `cree_par` varchar(120) DEFAULT NULL,
  `modifie_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `code` (`code`),
  KEY `statut` (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contacts auxiliaires des clients
CREATE TABLE IF NOT EXISTS `CA_clients_contacts_aux` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `client_id` varchar(32) NOT NULL,
  `prenom` varchar(80) DEFAULT NULL,
  `nom` varchar(80) DEFAULT NULL,
  `email` varchar(180) DEFAULT NULL,
  `tel` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projets
CREATE TABLE IF NOT EXISTS `CA_projets` (
  `id` varchar(32) NOT NULL,
  `code` varchar(30) DEFAULT NULL,
  `nom` varchar(200) NOT NULL,
  `client` varchar(200) DEFAULT NULL,
  `client_code` varchar(20) DEFAULT NULL,
  `annee` int DEFAULT NULL,
  `phase` varchar(20) DEFAULT 'APS',
  `statut` varchar(40) DEFAULT 'Actif',
  `type_bat` varchar(80) DEFAULT NULL,
  `delai` varchar(80) DEFAULT NULL,
  `honoraires` decimal(14,2) DEFAULT 0,
  `budget` decimal(14,2) DEFAULT 0,
  `surface` decimal(12,2) DEFAULT 0,
  `description` text,
  `adresse` text,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `surface_shon` decimal(12,2) DEFAULT NULL,
  `surface_shob` decimal(12,2) DEFAULT NULL,
  `surface_terrain` decimal(12,2) DEFAULT NULL,
  `standing` varchar(40) DEFAULT NULL,
  `zone` varchar(40) DEFAULT NULL,
  `cout_construction` decimal(14,2) DEFAULT NULL,
  `cout_m2` decimal(10,2) DEFAULT NULL,
  `cree_par` varchar(120) DEFAULT NULL,
  `modifie_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `statut` (`statut`),
  KEY `client_code` (`client_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Missions par projet
CREATE TABLE IF NOT EXISTS `CA_projets_missions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `projet_id` varchar(32) NOT NULL,
  `mission` varchar(150) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `projet_id` (`projet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intervenants par projet
CREATE TABLE IF NOT EXISTS `CA_projets_intervenants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `projet_id` varchar(32) NOT NULL,
  `role` varchar(80) DEFAULT NULL,
  `nom` varchar(120) NOT NULL,
  `contact` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `projet_id` (`projet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Devis
CREATE TABLE IF NOT EXISTS `CA_devis` (
  `id` varchar(32) NOT NULL,
  `numero` varchar(40) DEFAULT NULL,
  `client` varchar(200) DEFAULT NULL,
  `client_id` varchar(32) DEFAULT NULL,
  `projet_id` varchar(32) DEFAULT NULL,
  `montant_ht` decimal(14,2) DEFAULT 0,
  `tva` decimal(5,2) DEFAULT 0,
  `montant_ttc` decimal(14,2) DEFAULT 0,
  `statut` varchar(40) DEFAULT 'En attente',
  `date_devis` date DEFAULT NULL,
  `date_expiry` date DEFAULT NULL,
  `objet` varchar(300) DEFAULT NULL,
  `notes` text,
  `cree_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `statut` (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Factures
CREATE TABLE IF NOT EXISTS `CA_factures` (
  `id` varchar(32) NOT NULL,
  `numero` varchar(40) DEFAULT NULL,
  `client` varchar(200) DEFAULT NULL,
  `client_id` varchar(32) DEFAULT NULL,
  `projet_id` varchar(32) DEFAULT NULL,
  `montant_ht` decimal(14,2) DEFAULT 0,
  `tva` decimal(5,2) DEFAULT 0,
  `montant_ttc` decimal(14,2) DEFAULT 0,
  `statut` varchar(40) DEFAULT 'Impayée',
  `date_facture` date DEFAULT NULL,
  `date_echeance` date DEFAULT NULL,
  `date_paiement` date DEFAULT NULL,
  `notes` text,
  `cree_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `statut` (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dépenses
CREATE TABLE IF NOT EXISTS `CA_depenses` (
  `id` varchar(32) NOT NULL,
  `description` varchar(300) DEFAULT NULL,
  `montant` decimal(14,2) NOT NULL DEFAULT 0,
  `categorie` varchar(80) DEFAULT NULL,
  `projet_id` varchar(32) DEFAULT NULL,
  `date_dep` date DEFAULT NULL,
  `justificatif` varchar(300) DEFAULT NULL,
  `cree_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `categorie` (`categorie`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paramètres (clé-valeur)
CREATE TABLE IF NOT EXISTS `CA_parametres` (
  `cle` varchar(80) NOT NULL,
  `valeur` longtext,
  PRIMARY KEY (`cle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demandes (configurateur public)
CREATE TABLE IF NOT EXISTS `CA_demandes` (
  `id` varchar(32) NOT NULL,
  `nom_projet` varchar(200) NOT NULL,
  `prenom` varchar(80) NOT NULL,
  `nom` varchar(80) NOT NULL,
  `tel` varchar(40) NOT NULL,
  `whatsapp` varchar(40) DEFAULT NULL,
  `email` varchar(180) DEFAULT NULL,
  `cfg_data` longtext NOT NULL,
  `surface_estimee` decimal(12,2) DEFAULT NULL,
  `cout_estime_low` decimal(14,2) DEFAULT NULL,
  `cout_estime_high` decimal(14,2) DEFAULT NULL,
  `statut` varchar(40) NOT NULL DEFAULT 'nouvelle',
  `client_id` varchar(32) DEFAULT NULL,
  `projet_id` varchar(32) DEFAULT NULL,
  `devis_id` varchar(32) DEFAULT NULL,
  `remarques` text,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `traite_par` varchar(120) DEFAULT NULL,
  `traite_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_statut` (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tâches / Suivi de missions (hiérarchie : mission → tâche → sous-tâche)
CREATE TABLE IF NOT EXISTS `CA_taches` (
  `id` varchar(32) NOT NULL,
  `projet_id` varchar(32) NOT NULL,
  `parent_id` varchar(32) DEFAULT NULL,
  `niveau` tinyint NOT NULL DEFAULT 0 COMMENT '0=mission, 1=tâche, 2=sous-tâche',
  `titre` varchar(200) NOT NULL,
  `description` text,
  `statut` varchar(40) NOT NULL DEFAULT 'A faire',
  `priorite` varchar(20) NOT NULL DEFAULT 'Normale',
  `assignee` varchar(120) DEFAULT NULL,
  `date_debut` date DEFAULT NULL,
  `date_echeance` date DEFAULT NULL,
  `progression` int NOT NULL DEFAULT 0,
  `ordre` int NOT NULL DEFAULT 0,
  `categorie` varchar(10) DEFAULT NULL COMMENT 'Code catégorie mission (ex: CON, EXE, AMO…)',
  `cree_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `projet_id` (`projet_id`),
  KEY `parent_id` (`parent_id`),
  KEY `statut` (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal quotidien — suivi journalier par membre
CREATE TABLE IF NOT EXISTS `CA_journal` (
  `id` varchar(32) NOT NULL,
  `tache_id` varchar(32) NOT NULL,
  `projet_id` varchar(32) NOT NULL,
  `membre` varchar(120) NOT NULL,
  `date_jour` date NOT NULL,
  `commentaire` text,
  `progression_avant` int NOT NULL DEFAULT 0,
  `progression_apres` int NOT NULL DEFAULT 0,
  `heures` decimal(4,1) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `tache_id` (`tache_id`),
  KEY `projet_id` (`projet_id`),
  KEY `membre_date` (`membre`, `date_jour`),
  KEY `date_jour` (`date_jour`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demandes administratives (courriers vers administrations)
CREATE TABLE IF NOT EXISTS `CA_demandes_admin` (
  `id` varchar(32) NOT NULL,
  `projet_id` varchar(32) DEFAULT NULL,
  `client_id` varchar(32) DEFAULT NULL,
  `type_demande` varchar(120) NOT NULL COMMENT 'demande d''avis, demande de devis, etc.',
  `langue` enum('fr','ar') NOT NULL DEFAULT 'fr',
  `administration` varchar(200) NOT NULL,
  `gouvernorat` varchar(120) DEFAULT NULL,
  `delegation` varchar(120) DEFAULT NULL,
  `municipalite` varchar(200) DEFAULT NULL,
  `objet` varchar(400) NOT NULL,
  `contenu` longtext COMMENT 'corps de la lettre générée',
  `documents_joints` longtext COMMENT 'JSON: liste des documents cochés',
  `expediteur` varchar(200) DEFAULT NULL,
  `destinataire` varchar(400) DEFAULT NULL,
  `reference` varchar(120) DEFAULT NULL,
  `date_demande` date NOT NULL,
  `statut` varchar(40) NOT NULL DEFAULT 'Brouillon',
  `remarques` text,
  `cree_par` varchar(120) DEFAULT NULL,
  `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `projet_id` (`projet_id`),
  KEY `client_id` (`client_id`),
  KEY `statut` (`statut`),
  KEY `administration` (`administration`),
  KEY `date_demande` (`date_demande`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration si table existe déjà :
-- ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `client_id` varchar(32) DEFAULT NULL AFTER `projet_id`;
-- ALTER TABLE `CA_demandes_admin` ADD KEY IF NOT EXISTS `client_id` (`client_id`);

SET FOREIGN_KEY_CHECKS = 1;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : ajouter les colonnes configurateur à CA_projets
-- Exécuter si la table existe déjà sans ces colonnes
-- ════════════════════════════════════════════════════════════
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_shon` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_shob` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_terrain` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `standing` varchar(40) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `zone` varchar(40) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `cout_construction` decimal(14,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `cout_m2` decimal(10,2) DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : créer la table CA_demandes (configurateur public)
-- Exécuter si la table n'existe pas encore
-- ════════════════════════════════════════════════════════════
-- CREATE TABLE IF NOT EXISTS `CA_demandes` ( ... );  -- voir définition complète ci-dessus

-- ════════════════════════════════════════════════════════════
-- MIGRATION : ajouter les colonnes de liaison à CA_demandes
-- Exécuter si la table existe déjà sans ces colonnes
-- ════════════════════════════════════════════════════════════
-- ALTER TABLE `CA_demandes` ADD COLUMN IF NOT EXISTS `client_id` varchar(32) DEFAULT NULL;
-- ALTER TABLE `CA_demandes` ADD COLUMN IF NOT EXISTS `projet_id` varchar(32) DEFAULT NULL;
-- ALTER TABLE `CA_demandes` ADD COLUMN IF NOT EXISTS `devis_id` varchar(32) DEFAULT NULL;
-- ALTER TABLE `CA_demandes` ADD COLUMN IF NOT EXISTS `traite_par` varchar(120) DEFAULT NULL;
-- ALTER TABLE `CA_demandes` ADD COLUMN IF NOT EXISTS `traite_at` datetime DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Module Équipe v2
--   - Photo de profil
--   - Double contact (Pro / Perso) + principal
--   - Rémunération & Coût Employeur (réservé gérant)
--   - Projection d'augmentation
-- Exécuter dans phpMyAdmin
-- ════════════════════════════════════════════════════════════
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `profile_picture_url` VARCHAR(400) DEFAULT NULL;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `tel_pro`             VARCHAR(50)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `tel_perso`           VARCHAR(50)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `tel_principal`       ENUM('pro','perso') NOT NULL DEFAULT 'pro';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `email_pro`           VARCHAR(191) DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `email_perso`         VARCHAR(191) DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `email_principal`     ENUM('pro','perso') NOT NULL DEFAULT 'pro';
-- Rémunération (sensible — uniquement retourné aux gérants)
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `salaire_net`         DECIMAL(12,2) DEFAULT 0;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `charges_sociales`    DECIMAL(12,2) DEFAULT 0;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `subventions`         DECIMAL(12,2) DEFAULT 0;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `avantages_nature`    DECIMAL(12,2) DEFAULT 0;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `heures_mois`         DECIMAL(6,2)  DEFAULT 160;
-- Projection d'augmentation
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `date_embauche`       DATE         DEFAULT NULL;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `date_derniere_augm`  DATE         DEFAULT NULL;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `taux_augm_pct`       DECIMAL(5,2) DEFAULT 5;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Registre dynamique des modules de la plateforme
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `cortoba_modules` (
  `id`          VARCHAR(40)  NOT NULL PRIMARY KEY,
  `label`       VARCHAR(120) NOT NULL,
  `route_url`   VARCHAR(200) DEFAULT NULL,
  `categorie`   VARCHAR(60)  DEFAULT 'principal',
  `ordre`       INT          NOT NULL DEFAULT 100,
  `actif`       TINYINT(1)   NOT NULL DEFAULT 1,
  `cree_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Dépenses récurrentes (templates + notifications)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `CA_depenses_templates` (
  `id`                 VARCHAR(32)  NOT NULL PRIMARY KEY,
  `label`              VARCHAR(300) NOT NULL,
  `categorie`          VARCHAR(80)  DEFAULT NULL,
  `fournisseur`        VARCHAR(200) DEFAULT NULL,
  `code_tva`           VARCHAR(80)  DEFAULT NULL,
  `frequency`          ENUM('weekly','monthly','quarterly','semiannual','yearly') NOT NULL DEFAULT 'monthly',
  `amount_type`        ENUM('fixed','estimated') NOT NULL DEFAULT 'fixed',
  `base_amount_ht`     DECIMAL(14,3) NOT NULL DEFAULT 0,
  `vat_rate`           DECIMAL(5,2)  NOT NULL DEFAULT 19,
  `stamp_duty`         DECIMAL(14,3) NOT NULL DEFAULT 0,
  `base_amount_ttc`    DECIMAL(14,3) NOT NULL DEFAULT 0,
  `lignes_json`        LONGTEXT     DEFAULT NULL,
  `next_due_date`      DATE         NOT NULL,
  `notify_days_before` INT          NOT NULL DEFAULT 5,
  `end_date`           DATE         DEFAULT NULL,
  `status`             ENUM('active','paused','cancelled') NOT NULL DEFAULT 'active',
  `cree_par`           VARCHAR(120) DEFAULT NULL,
  `cree_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`         DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_status`     (`status`),
  KEY `idx_next_due`   (`next_due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lier les dépenses payées à leur template d'origine
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `template_id` VARCHAR(32) DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `fournisseur` VARCHAR(200) DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `reference` VARCHAR(120) DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `code_tva_fournisseur` VARCHAR(80) DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `montant_ht`  DECIMAL(14,3) DEFAULT 0;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `montant_tva` DECIMAL(14,3) DEFAULT 0;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `timbre`      DECIMAL(14,3) DEFAULT 0;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `montant_ttc` DECIMAL(14,3) DEFAULT 0;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `lignes_json` LONGTEXT DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Fiche de paie — infos employé + lien dépense/membre
-- ════════════════════════════════════════════════════════════
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `cin`                 VARCHAR(20)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `matricule`           VARCHAR(40)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `n_cnss`              VARCHAR(40)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `situation_familiale` VARCHAR(20)  DEFAULT 'Célibataire';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `enfants_charge`      INT          DEFAULT 0;
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `adresse`             VARCHAR(300) DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `echelon`             VARCHAR(40)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `categorie_emploi`    VARCHAR(40)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `emploi`              VARCHAR(120) DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `banque`              VARCHAR(120) DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `rib`                 VARCHAR(40)  DEFAULT '';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `mode_paiement`       VARCHAR(30)  DEFAULT 'Virement';
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `salaire_base`        DECIMAL(12,3) DEFAULT 0;

-- Lier une dépense salaire à un membre (pour générer fiche de paie + historique)
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `employe_id`    VARCHAR(32) DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `paie_mois`     VARCHAR(7)  DEFAULT NULL;
ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `paie_snapshot` LONGTEXT    DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Suivi v3 — Localisation, heures estimées, progression planifiée
--   + couleur membre + Timesheets + dépendances Gantt + workflow demandes
-- ════════════════════════════════════════════════════════════
-- Tâches : localisation (bureau/chantier/admin) + estimation + planifié
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `location_type`        VARCHAR(20)   DEFAULT 'Bureau' COMMENT 'Bureau|Chantier|Administration';
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `location_zone`        VARCHAR(120)  DEFAULT '';
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `heures_estimees`      DECIMAL(6,2)  DEFAULT 0;
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `heures_reelles`       DECIMAL(6,2)  DEFAULT 0;
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `progression_planifiee` INT          DEFAULT 0 COMMENT '% planifié vs réel';
ALTER TABLE `CA_taches` ADD COLUMN IF NOT EXISTS `progression_manuelle` TINYINT(1)    DEFAULT 0 COMMENT '1 = progression forcée manuellement, ignorer cascade';

-- Couleur d'identification membre (badges kanban, avatars)
ALTER TABLE `cortoba_users` ADD COLUMN IF NOT EXISTS `color` VARCHAR(9) DEFAULT '#c8a96e';

-- Workflow demandes administratives — statuts avancés + pièces jointes
ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `justificatif_url`   VARCHAR(500) DEFAULT NULL;
ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `date_depot`         DATE         DEFAULT NULL;
ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `documents_manquants` LONGTEXT    DEFAULT NULL COMMENT 'JSON: checklist pièces à fournir';
ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `reponse_type`       VARCHAR(20)  DEFAULT NULL COMMENT 'positive|negative';
ALTER TABLE `CA_demandes_admin` ADD COLUMN IF NOT EXISTS `parent_demande_id`  VARCHAR(32)  DEFAULT NULL COMMENT 'FK sur demande initiale si redépôt';

-- Timesheet — saisie du temps par collaborateur / tâche
CREATE TABLE IF NOT EXISTS `CA_timesheets` (
  `id`          VARCHAR(32)   NOT NULL PRIMARY KEY,
  `user_id`     VARCHAR(32)   NOT NULL,
  `user_name`   VARCHAR(120)  DEFAULT NULL,
  `projet_id`   VARCHAR(32)   DEFAULT NULL,
  `tache_id`    VARCHAR(32)   DEFAULT NULL,
  `date_jour`   DATE          NOT NULL,
  `hours_spent` DECIMAL(5,2)  NOT NULL DEFAULT 0,
  `is_billable` TINYINT(1)    NOT NULL DEFAULT 1,
  `commentaire` VARCHAR(400)  DEFAULT NULL,
  `cree_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`  DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_user_date` (`user_id`,`date_jour`),
  KEY `idx_projet`    (`projet_id`),
  KEY `idx_tache`     (`tache_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dépendances entre tâches (Gantt)
CREATE TABLE IF NOT EXISTS `CA_task_dependencies` (
  `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
  `task_id`    VARCHAR(32)  NOT NULL COMMENT 'tâche qui doit attendre',
  `depends_on` VARCHAR(32)  NOT NULL COMMENT 'tâche à finir avant',
  `type`       VARCHAR(20)  NOT NULL DEFAULT 'FS' COMMENT 'FS=Finish→Start, SS, FF',
  `lag_days`   INT          NOT NULL DEFAULT 0,
  `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_dep` (`task_id`,`depends_on`),
  KEY `idx_task`    (`task_id`),
  KEY `idx_depends` (`depends_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MIGRATION : Module Congés — demandes + soldes + heatmap
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `CA_leave_requests` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `user_id`          VARCHAR(32)   NOT NULL,
  `user_name`        VARCHAR(120)  DEFAULT NULL,
  `type`             VARCHAR(30)   NOT NULL DEFAULT 'Congés annuels'
                     COMMENT 'Congés annuels | Maladie | Récupération | Sans solde | Autre',
  `date_debut`       DATE          NOT NULL,
  `date_fin`         DATE          NOT NULL,
  `jours`            DECIMAL(5,1)  NOT NULL DEFAULT 0,
  `motif`            VARCHAR(400)  DEFAULT NULL,
  `delegation`       VARCHAR(400)  NOT NULL COMMENT 'A qui les tâches urgentes sont transférées',
  `statut`           VARCHAR(20)   NOT NULL DEFAULT 'En attente'
                     COMMENT 'En attente | Approuvé | Refusé | Annulé',
  `commentaire_admin` VARCHAR(500) DEFAULT NULL,
  `decision_par`     VARCHAR(120)  DEFAULT NULL,
  `decision_at`      DATETIME      DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_user`   (`user_id`),
  KEY `idx_statut` (`statut`),
  KEY `idx_dates`  (`date_debut`,`date_fin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `CA_leave_balances` (
  `user_id`          VARCHAR(32)   NOT NULL,
  `annee`            INT           NOT NULL,
  `conges_annuels`   DECIMAL(5,1)  NOT NULL DEFAULT 22,
  `maladie`          DECIMAL(5,1)  NOT NULL DEFAULT 15,
  `recuperation`     DECIMAL(5,1)  NOT NULL DEFAULT 0,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`annee`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════
-- MODULE GESTION DE CHANTIER
-- ════════════════════════════════════════════════════════════

-- Chantiers (lié à un projet existant)
CREATE TABLE IF NOT EXISTS `CA_chantiers` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `projet_id`        VARCHAR(32)   NOT NULL,
  `nom`              VARCHAR(200)  NOT NULL,
  `code`             VARCHAR(30)   DEFAULT NULL,
  `adresse`          TEXT          DEFAULT NULL,
  `lat`              DECIMAL(10,7) DEFAULT NULL,
  `lng`              DECIMAL(10,7) DEFAULT NULL,
  `date_debut`       DATE          DEFAULT NULL,
  `date_fin_prevue`  DATE          DEFAULT NULL,
  `date_fin_reelle`  DATE          DEFAULT NULL,
  `statut`           VARCHAR(40)   NOT NULL DEFAULT 'En préparation'
                     COMMENT 'En préparation | En cours | Suspendu | Réceptionné | Clôturé',
  `avancement_global` INT          NOT NULL DEFAULT 0 COMMENT '% global 0-100',
  `budget_travaux`   DECIMAL(14,2) DEFAULT 0,
  `montant_engage`   DECIMAL(14,2) DEFAULT 0,
  `description`      TEXT          DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_projet`   (`projet_id`),
  KEY `idx_statut`   (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lots / Corps d'état d'un chantier
CREATE TABLE IF NOT EXISTS `CA_chantier_lots` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `code`             VARCHAR(20)   DEFAULT NULL,
  `nom`              VARCHAR(200)  NOT NULL
                     COMMENT 'Ex: Gros œuvre, Second œuvre, CVC, Électricité, Plomberie, etc.',
  `entreprise`       VARCHAR(200)  DEFAULT NULL,
  `montant_marche`   DECIMAL(14,2) DEFAULT 0,
  `avancement`       INT           NOT NULL DEFAULT 0,
  `date_debut`       DATE          DEFAULT NULL,
  `date_fin_prevue`  DATE          DEFAULT NULL,
  `ordre`            INT           NOT NULL DEFAULT 0,
  `couleur`          VARCHAR(9)    DEFAULT '#c8a96e',
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tâches de planification chantier (Gantt)
CREATE TABLE IF NOT EXISTS `CA_chantier_taches` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `lot_id`           VARCHAR(32)   DEFAULT NULL,
  `parent_id`        VARCHAR(32)   DEFAULT NULL,
  `titre`            VARCHAR(200)  NOT NULL,
  `date_debut`       DATE          DEFAULT NULL,
  `date_fin`         DATE          DEFAULT NULL,
  `duree_jours`      INT           DEFAULT 0,
  `avancement`       INT           NOT NULL DEFAULT 0,
  `est_jalon`        TINYINT(1)    NOT NULL DEFAULT 0,
  `est_critique`     TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'Chemin critique',
  `ordre`            INT           NOT NULL DEFAULT 0,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_lot`       (`lot_id`),
  KEY `idx_parent`    (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dépendances entre tâches chantier
CREATE TABLE IF NOT EXISTS `CA_chantier_tache_deps` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `task_id`          VARCHAR(32)   NOT NULL,
  `depends_on`       VARCHAR(32)   NOT NULL,
  `type`             VARCHAR(10)   NOT NULL DEFAULT 'FS' COMMENT 'FS, FF, SS, SF',
  `lag_days`         INT           NOT NULL DEFAULT 0,
  UNIQUE KEY `uq_dep` (`task_id`, `depends_on`),
  KEY `idx_task`      (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Journal de chantier quotidien
CREATE TABLE IF NOT EXISTS `CA_chantier_journal` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `date_jour`        DATE          NOT NULL,
  `meteo`            VARCHAR(40)   DEFAULT NULL COMMENT 'Ensoleillé | Nuageux | Pluie | Vent fort | Neige',
  `temperature`      VARCHAR(20)   DEFAULT NULL,
  `effectif_total`   INT           DEFAULT 0,
  `activites`        LONGTEXT      DEFAULT NULL COMMENT 'Description des activités réalisées',
  `livraisons`       TEXT          DEFAULT NULL,
  `visiteurs`        TEXT          DEFAULT NULL,
  `retards`          TEXT          DEFAULT NULL,
  `observations`     TEXT          DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_chantier_date` (`chantier_id`, `date_jour`),
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_date`      (`date_jour`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Effectifs journaliers par entreprise
CREATE TABLE IF NOT EXISTS `CA_chantier_effectifs` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `journal_id`       VARCHAR(32)   NOT NULL,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `entreprise`       VARCHAR(200)  NOT NULL,
  `nb_ouvriers`      INT           NOT NULL DEFAULT 0,
  `nb_cadres`        INT           NOT NULL DEFAULT 0,
  `commentaire`      VARCHAR(300)  DEFAULT NULL,
  KEY `idx_journal`   (`journal_id`),
  KEY `idx_chantier`  (`chantier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Intervenants chantier
CREATE TABLE IF NOT EXISTS `CA_chantier_intervenants` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `role`             VARCHAR(80)   NOT NULL
                     COMMENT 'Maître d''ouvrage | OPC | BET Structure | BET Fluides | Entreprise | Sous-traitant | SPS | Contrôleur technique | Architecte',
  `nom`              VARCHAR(200)  NOT NULL,
  `societe`          VARCHAR(200)  DEFAULT NULL,
  `tel`              VARCHAR(40)   DEFAULT NULL,
  `email`            VARCHAR(180)  DEFAULT NULL,
  `responsabilites`  TEXT          DEFAULT NULL,
  `acces_portail`    TINYINT(1)    NOT NULL DEFAULT 0,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Réunions de chantier
CREATE TABLE IF NOT EXISTS `CA_chantier_reunions` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `numero`           INT           NOT NULL DEFAULT 1 COMMENT 'Numéro auto-incrémenté par chantier',
  `date_reunion`     DATETIME      NOT NULL,
  `lieu`             VARCHAR(200)  DEFAULT NULL,
  `objet`            VARCHAR(300)  DEFAULT 'Réunion de chantier',
  `participants`     LONGTEXT      DEFAULT NULL COMMENT 'JSON: [{nom, role, present}]',
  `points_discutes`  LONGTEXT      DEFAULT NULL COMMENT 'Texte ou JSON structuré',
  `decisions`        LONGTEXT      DEFAULT NULL,
  `pv_contenu`       LONGTEXT      DEFAULT NULL COMMENT 'Contenu complet du PV',
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Brouillon' COMMENT 'Brouillon | Finalisé | Diffusé',
  `diffuse_at`       DATETIME      DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_date`      (`date_reunion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Actions issues des réunions
CREATE TABLE IF NOT EXISTS `CA_chantier_reunion_actions` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `reunion_id`       VARCHAR(32)   NOT NULL,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `description`      TEXT          NOT NULL,
  `responsable`      VARCHAR(200)  DEFAULT NULL,
  `delai`            DATE          DEFAULT NULL,
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Ouverte'
                     COMMENT 'Ouverte | En cours | Clôturée',
  `reunion_cloture_id` VARCHAR(32) DEFAULT NULL COMMENT 'Réunion lors de laquelle l''action a été clôturée',
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_reunion`   (`reunion_id`),
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_statut`    (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Photos et médias chantier
CREATE TABLE IF NOT EXISTS `CA_chantier_photos` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `journal_id`       VARCHAR(32)   DEFAULT NULL,
  `reserve_id`       VARCHAR(32)   DEFAULT NULL,
  `url`              VARCHAR(500)  NOT NULL,
  `thumbnail_url`    VARCHAR(500)  DEFAULT NULL,
  `type_media`       VARCHAR(20)   NOT NULL DEFAULT 'photo' COMMENT 'photo | video | timelapse',
  `titre`            VARCHAR(200)  DEFAULT NULL,
  `description`      TEXT          DEFAULT NULL,
  `zone`             VARCHAR(120)  DEFAULT NULL,
  `lot`              VARCHAR(120)  DEFAULT NULL,
  `tags`             VARCHAR(500)  DEFAULT NULL COMMENT 'Tags séparés par virgule',
  `lat`              DECIMAL(10,7) DEFAULT NULL,
  `lng`              DECIMAL(10,7) DEFAULT NULL,
  `date_prise`       DATETIME      DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_journal`   (`journal_id`),
  KEY `idx_zone`      (`zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Réserves / Punch list
CREATE TABLE IF NOT EXISTS `CA_chantier_reserves` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `lot_id`           VARCHAR(32)   DEFAULT NULL,
  `numero`           INT           NOT NULL DEFAULT 1,
  `titre`            VARCHAR(300)  NOT NULL,
  `description`      TEXT          DEFAULT NULL,
  `zone`             VARCHAR(120)  DEFAULT NULL,
  `localisation_x`   DECIMAL(8,2)  DEFAULT NULL COMMENT 'Position X sur plan (% largeur)',
  `localisation_y`   DECIMAL(8,2)  DEFAULT NULL COMMENT 'Position Y sur plan (%  hauteur)',
  `plan_ref`         VARCHAR(200)  DEFAULT NULL COMMENT 'Référence du plan concerné',
  `entreprise`       VARCHAR(200)  DEFAULT NULL,
  `priorite`         VARCHAR(20)   NOT NULL DEFAULT 'Normale' COMMENT 'Critique | Haute | Normale | Basse',
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Ouverte'
                     COMMENT 'Ouverte | En cours de reprise | Levée | Confirmée',
  `date_constat`     DATE          DEFAULT NULL,
  `date_delai`       DATE          DEFAULT NULL COMMENT 'Délai de levée',
  `date_levee`       DATE          DEFAULT NULL,
  `levee_par`        VARCHAR(120)  DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_lot`       (`lot_id`),
  KEY `idx_statut`    (`statut`),
  KEY `idx_entreprise`(`entreprise`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- RFI — Demandes d'information
CREATE TABLE IF NOT EXISTS `CA_chantier_rfi` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `numero`           INT           NOT NULL DEFAULT 1,
  `objet`            VARCHAR(300)  NOT NULL,
  `description`      TEXT          DEFAULT NULL,
  `documents_ref`    TEXT          DEFAULT NULL COMMENT 'Références plans/documents concernés',
  `emetteur`         VARCHAR(200)  DEFAULT NULL,
  `destinataire`     VARCHAR(200)  DEFAULT NULL COMMENT 'Architecte, BET, etc.',
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Ouverte'
                     COMMENT 'Ouverte | En attente | Résolue | Annulée',
  `priorite`         VARCHAR(20)   NOT NULL DEFAULT 'Normale',
  `date_emission`    DATE          DEFAULT NULL,
  `date_reponse_attendue` DATE     DEFAULT NULL,
  `date_reponse`     DATE          DEFAULT NULL,
  `reponse`          LONGTEXT      DEFAULT NULL,
  `repondu_par`      VARCHAR(200)  DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_statut`    (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Visas (approbation des documents d'exécution)
CREATE TABLE IF NOT EXISTS `CA_chantier_visas` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `lot_id`           VARCHAR(32)   DEFAULT NULL,
  `numero`           INT           NOT NULL DEFAULT 1,
  `document_titre`   VARCHAR(300)  NOT NULL,
  `document_ref`     VARCHAR(120)  DEFAULT NULL,
  `document_url`     VARCHAR(500)  DEFAULT NULL,
  `emetteur`         VARCHAR(200)  DEFAULT NULL COMMENT 'Entreprise émettrice',
  `circuit_visa`     LONGTEXT      DEFAULT NULL COMMENT 'JSON: [{role, nom, statut, date, commentaire}]',
  `statut`           VARCHAR(40)   NOT NULL DEFAULT 'En attente'
                     COMMENT 'En attente | BPE | Bon avec observations | Refusé | Sans objet',
  `date_reception`   DATE          DEFAULT NULL,
  `date_visa`        DATE          DEFAULT NULL,
  `commentaire`      TEXT          DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_lot`       (`lot_id`),
  KEY `idx_statut`    (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Incidents et sécurité
CREATE TABLE IF NOT EXISTS `CA_chantier_incidents` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `type`             VARCHAR(40)   NOT NULL DEFAULT 'Incident'
                     COMMENT 'Incident | Quasi-accident | Accident | Observation sécurité',
  `gravite`          VARCHAR(20)   NOT NULL DEFAULT 'Mineure'
                     COMMENT 'Critique | Majeure | Mineure | Observation',
  `titre`            VARCHAR(300)  NOT NULL,
  `description`      TEXT          DEFAULT NULL,
  `zone`             VARCHAR(120)  DEFAULT NULL,
  `entreprise`       VARCHAR(200)  DEFAULT NULL,
  `personnes_impliquees` TEXT      DEFAULT NULL,
  `date_incident`    DATETIME      NOT NULL,
  `mesures_immediates` TEXT        DEFAULT NULL,
  `mesures_correctives` TEXT       DEFAULT NULL,
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Ouvert'
                     COMMENT 'Ouvert | En traitement | Clôturé',
  `date_cloture`     DATE          DEFAULT NULL,
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_type`      (`type`),
  KEY `idx_statut`    (`statut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Inspections sécurité (check-lists)
CREATE TABLE IF NOT EXISTS `CA_chantier_inspections` (
  `id`               VARCHAR(32)   NOT NULL PRIMARY KEY,
  `chantier_id`      VARCHAR(32)   NOT NULL,
  `titre`            VARCHAR(200)  NOT NULL DEFAULT 'Inspection sécurité',
  `date_inspection`  DATE          NOT NULL,
  `inspecteur`       VARCHAR(200)  DEFAULT NULL,
  `zone`             VARCHAR(120)  DEFAULT NULL,
  `checklist`        LONGTEXT      DEFAULT NULL COMMENT 'JSON: [{item, conforme, commentaire}]',
  `score`            INT           DEFAULT NULL COMMENT 'Score conformité %',
  `observations`     TEXT          DEFAULT NULL,
  `actions_requises` LONGTEXT      DEFAULT NULL COMMENT 'JSON: [{action, responsable, delai}]',
  `statut`           VARCHAR(30)   NOT NULL DEFAULT 'Complétée'
                     COMMENT 'Planifiée | En cours | Complétée',
  `cree_par`         VARCHAR(120)  DEFAULT NULL,
  `cree_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chantier`  (`chantier_id`),
  KEY `idx_date`      (`date_inspection`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Préférences de notifications par utilisateur
CREATE TABLE IF NOT EXISTS `CA_notification_prefs` (
  `user_id`       VARCHAR(32)  NOT NULL,
  `notif_type`    VARCHAR(60)  NOT NULL DEFAULT '_default',
  `channel_inapp` TINYINT(1)   NOT NULL DEFAULT 1,
  `channel_email` TINYINT(1)   NOT NULL DEFAULT 1,
  `channel_push`  TINYINT(1)   NOT NULL DEFAULT 1,
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`, `notif_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Abonnements Push (Web Push API)
CREATE TABLE IF NOT EXISTS `CA_push_subscriptions` (
  `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
  `user_id`    VARCHAR(32)  NOT NULL,
  `endpoint`   TEXT         NOT NULL,
  `p256dh`     TEXT         NOT NULL,
  `auth`       TEXT         NOT NULL,
  `user_agent` VARCHAR(300) DEFAULT NULL,
  `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
