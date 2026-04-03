-- ============================================================
--  CORTOBA ATELIER — Published Projects table
--  Run this in phpMyAdmin on dxmmmjkr_CAS
-- ============================================================

CREATE TABLE IF NOT EXISTS `CA_published_projects` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `slug`            VARCHAR(120) NOT NULL UNIQUE,
  `title`           VARCHAR(200) NOT NULL,
  `category`        VARCHAR(100) DEFAULT 'Résidentiel',
  `location`        VARCHAR(200) DEFAULT '',
  `country`         VARCHAR(100) DEFAULT 'Tunisie',
  `year`            VARCHAR(10)  DEFAULT '',
  `surface`         VARCHAR(50)  DEFAULT '',
  `status`          VARCHAR(50)  DEFAULT 'Livré',
  `services`        VARCHAR(300) DEFAULT '',
  `description`     TEXT,
  `hero_image`      VARCHAR(300) DEFAULT '',
  `hero_position`   INT          DEFAULT 50,
  `gallery_images`  TEXT,
  `grid_class`      VARCHAR(20)  DEFAULT '',
  `sort_order`      INT          DEFAULT 0,
  `published`       TINYINT(1)   DEFAULT 1,
  `created_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
