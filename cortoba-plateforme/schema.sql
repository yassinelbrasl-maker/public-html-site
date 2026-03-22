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

-- Migration : nouvelles colonnes configurateur (à exécuter sur les installations existantes)
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_shon` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_shob` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `surface_terrain` decimal(12,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `standing` varchar(40) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `zone` varchar(40) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `cout_construction` decimal(14,2) DEFAULT NULL;
-- ALTER TABLE `CA_projets` ADD COLUMN IF NOT EXISTS `cout_m2` decimal(10,2) DEFAULT NULL;

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

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  MIGRATION CIVITAS — Exécuter une seule fois dans phpMyAdmin
-- ============================================================

-- Champs client pour le formulaire CIVITAS (permis de bâtir)
ALTER TABLE `CA_clients`
  ADD COLUMN IF NOT EXISTS `cin`       varchar(20)  DEFAULT NULL COMMENT 'N° CIN ou passeport (CIVITAS)' AFTER `matricule`,
  ADD COLUMN IF NOT EXISTS `date_cin`  date         DEFAULT NULL COMMENT 'Date émission CIN/passeport (CIVITAS)' AFTER `cin`;

-- Champs projet pour le formulaire CIVITAS
ALTER TABLE `CA_projets`
  ADD COLUMN IF NOT EXISTS `commune`           varchar(100) DEFAULT NULL COMMENT 'البلدية — Commune (CIVITAS)' AFTER `adresse`,
  ADD COLUMN IF NOT EXISTS `delegation`        varchar(100) DEFAULT NULL COMMENT 'الدائرة — Délégation (CIVITAS)' AFTER `commune`,
  ADD COLUMN IF NOT EXISTS `type_construction` enum('nouveau','extension','reconstruction','touristique') DEFAULT 'nouveau' COMMENT 'نوع البناء (CIVITAS)' AFTER `type_bat`,
  ADD COLUMN IF NOT EXISTS `civitas_demande`   enum('premiere','revision') DEFAULT 'premiere' COMMENT 'نوع المطلب (CIVITAS)' AFTER `type_construction`;

-- Migration : champs CIVITAS supplémentaires au niveau projet (lieu, identité MO arabe, CIN)
ALTER TABLE `CA_projets`
  ADD COLUMN IF NOT EXISTS `civitas_lieu`       varchar(300) DEFAULT NULL COMMENT 'مكان البناية — Adresse bâtisse (CIVITAS)' AFTER `delegation`,
  ADD COLUMN IF NOT EXISTS `civitas_prenom_ar`  varchar(100) DEFAULT NULL COMMENT 'الاسم بالعربية — Prénom arabe MO (CIVITAS)' AFTER `civitas_lieu`,
  ADD COLUMN IF NOT EXISTS `civitas_nom_ar`     varchar(100) DEFAULT NULL COMMENT 'اللقب بالعربية — Nom arabe MO (CIVITAS)' AFTER `civitas_prenom_ar`,
  ADD COLUMN IF NOT EXISTS `civitas_cin`        varchar(20)  DEFAULT NULL COMMENT 'رقم بطاقة التعريف — CIN/passeport (CIVITAS)' AFTER `civitas_nom_ar`,
  ADD COLUMN IF NOT EXISTS `civitas_date_cin`   date         DEFAULT NULL COMMENT 'تاريخ الإصدار — Date émission CIN (CIVITAS)' AFTER `civitas_cin`;
