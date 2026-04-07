<?php
// ============================================================
//  CORTOBA LANDSCAPING — Hero Slider API
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
        bg_color    VARCHAR(20) DEFAULT '#0c0d0a',
        sort_order  INT DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {}

// ── GET (public) ──
if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    jsonOk($rows);
}

// ── POST — create ──
if ($method === 'POST') {
    requireAdmin();
    $d = getBody();
    $path = sanitize($d['image_path'] ?? '');
    if (!$path) jsonError('Image requise');

    $stmt = $pdo->prepare("INSERT INTO $table (image_path, alt_text, bg_color, sort_order) VALUES (?,?,?,?)");
    $stmt->execute([
        $path,
        sanitize($d['alt_text'] ?? ''),
        sanitize($d['bg_color'] ?? '#0c0d0a'),
        intval($d['sort_order'] ?? 0)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT — update ──
if ($method === 'PUT') {
    requireAdmin();
    $d = getBody();
    $id = intval($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("UPDATE $table SET image_path=?, alt_text=?, bg_color=?, sort_order=? WHERE id=?");
    $stmt->execute([
        sanitize($d['image_path'] ?? ''),
        sanitize($d['alt_text'] ?? ''),
        sanitize($d['bg_color'] ?? '#0c0d0a'),
        intval($d['sort_order'] ?? 0),
        $id
    ]);
    jsonOk(['updated' => $id]);
}

// ── DELETE ──
if ($method === 'DELETE') {
    requireAdmin();
    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("SELECT image_path FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row && $row['image_path']) {
        $filePath = __DIR__ . '/../../' . $row['image_path'];
        if (file_exists($filePath) && strpos($row['image_path'], 'published/') !== false) {
            @unlink($filePath);
        }
    }

    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}
