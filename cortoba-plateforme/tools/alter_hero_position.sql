-- Add hero_position column to CA_published_projects
-- Run this in phpMyAdmin if the table already exists
ALTER TABLE `CA_published_projects` ADD COLUMN `hero_position` INT DEFAULT 50 AFTER `hero_image`;
