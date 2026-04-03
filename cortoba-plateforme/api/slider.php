<?php
// ============================================================
//  CORTOBA ATELIER — Homepage Slider API
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('slider_images');

// Auto-create table if not exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "slider_images (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        image_path  VARCHAR(300) NOT NULL,
        alt_text    VARCHAR(200) DEFAULT '',
        sort_order  INT DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {}

// ── GET (public) → list all slider images ──
if ($method === 'GET') {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    jsonOk($rows);
}

// ── All write operations require admin ──
$user = requireAdmin();

// ── POST → add image ──
if ($method === 'POST') {
    $d = getBody();
    $path = trim($d['image_path'] ?? '');
    if (!$path) jsonError('Chemin image requis');

    $stmt = $pdo->prepare("INSERT INTO $table (image_path, alt_text, sort_order) VALUES (?, ?, ?)");
    $stmt->execute([
        $path,
        trim($d['alt_text'] ?? ''),
        (int)($d['sort_order'] ?? 0)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT → update image ──
if ($method === 'PUT') {
    $d = getBody();
    $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("UPDATE $table SET image_path = ?, alt_text = ?, sort_order = ? WHERE id = ?");
    $stmt->execute([
        trim($d['image_path'] ?? ''),
        trim($d['alt_text'] ?? ''),
        (int)($d['sort_order'] ?? 0),
        $id
    ]);
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
