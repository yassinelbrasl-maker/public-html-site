-- Add hero_position column to CDS_published_projects
-- Run this in phpMyAdmin if the table already exists
ALTER TABLE `CDS_published_projects` ADD COLUMN `hero_position` INT DEFAULT 50 AFTER `hero_image`;
