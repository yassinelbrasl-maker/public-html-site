<?php
// Script de diagnostic temporaire
error_reporting(E_ALL);
ini_set('display_errors', '1');
header('Content-Type: application/json; charset=utf-8');

echo json_encode(['step' => 'start']);

try {
    require_once __DIR__ . '/../config/middleware.php';
    echo "\n" . json_encode(['step' => 'middleware_ok']);

    $db = getDB();
    echo "\n" . json_encode(['step' => 'db_ok']);

    // Test if CA_chantiers table exists
    $tables = $db->query("SHOW TABLES LIKE 'CA_chantier%'")->fetchAll(PDO::FETCH_COLUMN);
    echo "\n" . json_encode(['step' => 'tables', 'data' => $tables]);

    // Test PHP version
    echo "\n" . json_encode(['step' => 'php_version', 'data' => PHP_VERSION]);

    // Try loading chantier.php
    // Include will fail if there's a parse error
    $syntax = php_strip_tags(file_get_contents(__DIR__ . '/chantier.php'));
    echo "\n" . json_encode(['step' => 'file_readable', 'size' => strlen($syntax)]);

} catch (\Throwable $e) {
    echo "\n" . json_encode(['step' => 'error', 'message' => $e->getMessage(), 'file' => basename($e->getFile()), 'line' => $e->getLine()]);
}
