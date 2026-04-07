<?php
// ============================================================
//  CORTOBA LANDSCAPING — Hero Slider API
//  Same features as architecture slider (zoom, position, fit)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('landscaping_slider');

// Auto-create table
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "landscaping_slider (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        image_path  VARCHAR(300) NOT NULL,
        alt_text    VARCHAR(200) DEFAULT '',
        fit_mode    VARCHAR(20)  DEFAULT 'cover',
        position_x  INT DEFAULT 50,
        position_y  INT DEFAULT 50,
        zoom        INT DEFAULT 100,
        bg_color    VARCHAR(20) DEFAULT '#0c0d0a',
        sort_order  INT DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Auto-add columns if missing (existing installs)
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_slider ADD COLUMN fit_mode VARCHAR(20) DEFAULT 'cover' AFTER alt_text"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_slider ADD COLUMN position_x INT DEFAULT 50 AFTER fit_mode"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_slider ADD COLUMN position_y INT DEFAULT 50 AFTER position_x"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_slider ADD COLUMN zoom INT DEFAULT 100 AFTER position_y"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_slider ADD COLUMN bg_color VARCHAR(20) DEFAULT '#0c0d0a' AFTER zoom"); } catch (Exception $ignore) {}
} catch (Exception $e) {}

// ── GET (public) ──
if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    jsonOk($rows);
}

// ── All write operations require admin ──
$user = requireAdmin();

// ── POST — create ──
if ($method === 'POST') {
    $d = getBody();
    $path = trim($d['image_path'] ?? '');
    if (!$path) jsonError('Image requise');

    $stmt = $pdo->prepare("INSERT INTO $table (image_path, alt_text, fit_mode, position_x, position_y, zoom, bg_color, sort_order) VALUES (?,?,?,?,?,?,?,?)");
    $stmt->execute([
        $path,
        trim($d['alt_text'] ?? ''),
        trim($d['fit_mode'] ?? 'cover'),
        (int)($d['position_x'] ?? 50),
        (int)($d['position_y'] ?? 50),
        (int)($d['zoom'] ?? 100),
        trim($d['bg_color'] ?? '#0c0d0a'),
        (int)($d['sort_order'] ?? 0)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT — update ──
if ($method === 'PUT') {
    $d = getBody();
    $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $sets = ["image_path = ?", "alt_text = ?", "sort_order = ?"];
    $vals = [trim($d['image_path'] ?? ''), trim($d['alt_text'] ?? ''), (int)($d['sort_order'] ?? 0)];
    foreach (['fit_mode' => 's', 'position_x' => 'i', 'position_y' => 'i', 'zoom' => 'i', 'bg_color' => 's'] as $col => $type) {
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

// ── DELETE ──
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("SELECT image_path FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row && $row['image_path']) {
        $rootDir = realpath(__DIR__ . '/../../');
        $imgPath = $rootDir . '/' . ltrim($row['image_path'], '/');
        if (file_exists($imgPath) && strpos($row['image_path'], '/published/') !== false) {
            @unlink($imgPath);
        }
    }

    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}
