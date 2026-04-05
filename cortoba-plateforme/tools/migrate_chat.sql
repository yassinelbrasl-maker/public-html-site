-- ════════════════════════════════════════════════════════════
-- CORTOBA PLATEFORME — Module Messagerie (Lot 1 + Lot 2)
-- À exécuter dans phpMyAdmin sur la base dxmmmjkr_CAS
-- ────────────────────────────────────────────────────────────
-- NOTE : ces tables sont aussi créées automatiquement par
-- api/chat.php au premier appel (CREATE TABLE IF NOT EXISTS).
-- Ce script permet une création manuelle anticipée.
-- ════════════════════════════════════════════════════════════

SET NAMES utf8mb4;

-- Rooms (discussions : direct | projet | client)
CREATE TABLE IF NOT EXISTS `CA_chat_rooms` (
  `id`           VARCHAR(32)  NOT NULL PRIMARY KEY,
  `type`         VARCHAR(10)  NOT NULL DEFAULT 'direct' COMMENT 'direct | projet | client',
  `name`         VARCHAR(200) DEFAULT NULL,
  `projet_id`    VARCHAR(32)  DEFAULT NULL,
  `is_archived`  TINYINT(1)   NOT NULL DEFAULT 0,
  `created_by`   VARCHAR(120) DEFAULT NULL,
  `cree_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modifie_at`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_type`     (`type`),
  KEY `idx_projet`   (`projet_id`),
  KEY `idx_archived` (`is_archived`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages
CREATE TABLE IF NOT EXISTS `CA_chat_messages` (
  `id`              VARCHAR(32)  NOT NULL PRIMARY KEY,
  `room_id`         VARCHAR(32)  NOT NULL,
  `sender_id`       VARCHAR(32)  DEFAULT NULL,
  `sender_name`     VARCHAR(200) DEFAULT NULL,
  `kind`            VARCHAR(20)  NOT NULL DEFAULT 'text' COMMENT 'text | system | file',
  `content`         LONGTEXT     DEFAULT NULL,
  `attachment_url`  VARCHAR(600) DEFAULT NULL,
  `attachment_name` VARCHAR(300) DEFAULT NULL,
  `cree_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_room_time` (`room_id`, `cree_at`),
  KEY `idx_sender`    (`sender_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Participants (pivot user ↔ room)
CREATE TABLE IF NOT EXISTS `CA_chat_participants` (
  `room_id`      VARCHAR(32)  NOT NULL,
  `user_id`      VARCHAR(32)  NOT NULL,
  `user_name`    VARCHAR(200) DEFAULT NULL,
  `joined_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_read_at` DATETIME     DEFAULT NULL,
  `is_favorite`  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`room_id`, `user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Decision Log (messages épinglés sur fiche projet)
CREATE TABLE IF NOT EXISTS `CA_chat_pinned` (
  `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
  `message_id` VARCHAR(32)  NOT NULL,
  `projet_id`  VARCHAR(32)  DEFAULT NULL,
  `pinned_by`  VARCHAR(120) DEFAULT NULL,
  `label`      VARCHAR(200) DEFAULT NULL,
  `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_projet`  (`projet_id`),
  KEY `idx_message` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Présence (heartbeat online/offline)
CREATE TABLE IF NOT EXISTS `CA_chat_presence` (
  `user_id`   VARCHAR(32) NOT NULL PRIMARY KEY,
  `last_seen` DATETIME    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
