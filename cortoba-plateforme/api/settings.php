<?php
// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — api/settings.php
//  Stockage clé/valeur des paramètres (logo, RIB, agence…)
// ═══════════════════════════════════════════════════════════════

ini_set('post_max_size', '8M');

// Même inclusion que tous les autres fichiers API
require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── Créer la table si elle n'existe pas ──
try {
    $db = getDB();
    $db->exec("
        CREATE TABLE IF NOT EXISTS CA_settings (
            setting_key   VARCHAR(120) NOT NULL PRIMARY KEY,
            setting_value MEDIUMTEXT   NOT NULL,
            updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (Exception $e) {
    jsonError('Erreur table settings : ' . $e->getMessage(), 500);
}

// ════════════════════════════════════════════════════════
//  GET — retourner tous les paramètres
// ════════════════════════════════════════════════════════
if ($method === 'GET') {
    $rows = $db->query("SELECT setting_key, setting_value FROM CA_settings")->fetchAll();
    $data = [];
    foreach ($rows as $row) {
        $decoded = json_decode($row['setting_value'], true);
        $data[$row['setting_key']] = ($decoded !== null) ? $decoded : $row['setting_value'];
    }
    jsonOk($data);
}

// ════════════════════════════════════════════════════════
//  POST — sauvegarder une clé/valeur
// ════════════════════════════════════════════════════════
if ($method === 'POST') {
    $body = getBody();

    if (empty($body['key'])) jsonError('Clé manquante', 400);

    $key   = trim($body['key']);
    $value = isset($body['value']) ? $body['value'] : '';
    $stored = is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE);

    if (strlen($key) > 120) jsonError('Clé trop longue', 400);

    $stmt = $db->prepare("
        INSERT INTO CA_settings (setting_key, setting_value)
        VALUES (:k, :v)
        ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()
    ");
    $stmt->execute([':k' => $key, ':v' => $stored, ':v2' => $stored]);
    jsonOk(['key' => $key, 'saved' => true]);
}

// ════════════════════════════════════════════════════════
//  DELETE — supprimer une clé
// ════════════════════════════════════════════════════════
if ($method === 'DELETE') {
    $key = isset($_GET['key']) ? trim($_GET['key']) : '';
    if (!$key) jsonError('Clé manquante', 400);

    $stmt = $db->prepare("DELETE FROM CA_settings WHERE setting_key = :k");
    $stmt->execute([':k' => $key]);
    jsonOk(['key' => $key, 'deleted' => true]);
}

jsonError('Méthode non supportée', 405);
