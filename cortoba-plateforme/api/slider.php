<?php
// ============================================================
//  CORTOBA ATELIER — Homepage Slider API
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('slider_images');

// Auto-create tables if not exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "slider_images (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        image_path  VARCHAR(300) NOT NULL,
        alt_text    VARCHAR(200) DEFAULT '',
        fit_mode    VARCHAR(20)  DEFAULT 'cover',
        sort_order  INT DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Auto-add columns if missing (existing installs)
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "slider_images ADD COLUMN fit_mode VARCHAR(20) DEFAULT 'cover' AFTER alt_text"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "slider_images ADD COLUMN position_x INT DEFAULT 50 AFTER fit_mode"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "slider_images ADD COLUMN position_y INT DEFAULT 50 AFTER position_x"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "slider_images ADD COLUMN zoom INT DEFAULT 100 AFTER position_y"); } catch (Exception $ignore) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "slider_settings (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_val VARCHAR(300) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {}

$settingsTable = t('slider_settings');

// ── GET (public) → list all slider images + settings ──
if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    $settingsRows = $pdo->query("SELECT setting_key, setting_val FROM $settingsTable")->fetchAll();
    $settings = [];
    foreach ($settingsRows as $sr) {
        $settings[$sr['setting_key']] = $sr['setting_val'];
    }
    echo json_encode(['success' => true, 'data' => $rows, 'settings' => $settings]);
    exit;
}

// ── All write operations require admin ──
$user = requireAdmin();

// ── POST → add image ──
if ($method === 'POST') {
    $d = getBody();
    $path = trim($d['image_path'] ?? '');
    if (!$path) jsonError('Chemin image requis');

    $stmt = $pdo->prepare("INSERT INTO $table (image_path, alt_text, fit_mode, position_x, position_y, zoom, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $path,
        trim($d['alt_text'] ?? ''),
        trim($d['fit_mode'] ?? 'cover'),
        (int)($d['position_x'] ?? 50),
        (int)($d['position_y'] ?? 50),
        (int)($d['zoom'] ?? 100),
        (int)($d['sort_order'] ?? 0)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT → update image ──
if ($method === 'PUT') {
    $d = getBody();
    $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $sets = ["image_path = ?", "alt_text = ?", "sort_order = ?"];
    $vals = [trim($d['image_path'] ?? ''), trim($d['alt_text'] ?? ''), (int)($d['sort_order'] ?? 0)];
    foreach (['fit_mode' => 's', 'position_x' => 'i', 'position_y' => 'i', 'zoom' => 'i'] as $col => $type) {
        if (isset($d[$col])) {
            $sets[] = "$col = ?";
            $vals[] = $type === 'i' ? (int)$d[$col] : trim($d[$col]);
        }
    }
    $vals[] = $id;
    $stmt = $pdo->prepare("UPDATE $table SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($vals);
    jsonOk(['id' => $id]);
}

// ── DELETE → remove image ──
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $d = getBody();
    if (!$id) $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    // Get image path to delete file
    $stmt = $pdo->prepare("SELECT image_path FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if ($row) {
        $rootDir = realpath(__DIR__ . '/../../');
        $imgPath = $rootDir . '/' . ltrim($row['image_path'], '/');
        if (file_exists($imgPath) && strpos($row['image_path'], '/published/') !== false) {
            unlink($imgPath);
        }
    }

    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}

// ── PUT ?reorder=1 → bulk reorder ──
if ($method === 'PUT' && !empty($_GET['reorder'])) {
    $d = getBody();
    $order = $d['order'] ?? [];
    foreach ($order as $i => $id) {
        $pdo->prepare("UPDATE $table SET sort_order = ? WHERE id = ?")->execute([$i, (int)$id]);
    }
    jsonOk(['reordered' => count($order)]);
}

// ── PATCH → update slider settings ──
if ($method === 'PATCH') {
    $d = getBody();
    $allowed = ['fit_mode'];
    $updated = [];
    foreach ($allowed as $key) {
        if (isset($d[$key])) {
            $stmt = $pdo->prepare("INSERT INTO $settingsTable (setting_key, setting_val) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_val = VALUES(setting_val)");
            $stmt->execute([$key, trim($d[$key])]);
            $updated[$key] = trim($d[$key]);
        }
    }
    jsonOk($updated);
}
