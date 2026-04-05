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
  `nas_path` varchar(500) DEFAULT NULL,
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
