<?php
// ============================================================
//  CORTOBA LANDSCAPING — Projects API
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('landscaping_projects');

// Auto-create table
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "landscaping_projects (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        title       VARCHAR(200) NOT NULL,
        tag         VARCHAR(100) DEFAULT '',
        location    VARCHAR(200) DEFAULT '',
        image       VARCHAR(300) DEFAULT '',
        link        VARCHAR(300) DEFAULT '',
        sort_order  INT DEFAULT 0,
        published   TINYINT(1) DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {}

// ── GET (public) ──
if ($method === 'GET') {
    $admin = isset($_GET['admin']);
    if ($admin) {
        requireAdmin();
        $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    } else {
        $rows = $pdo->query("SELECT * FROM $table WHERE published = 1 ORDER BY sort_order ASC, id ASC")->fetchAll();
    }
    jsonOk($rows);
}

// ── POST — create ──
if ($method === 'POST') {
    requireAdmin();
    $d = getBody();
    $title = sanitize($d['title'] ?? '');
    if (!$title) jsonError('Titre requis');

    $stmt = $pdo->prepare("INSERT INTO $table (title, tag, location, image, link, sort_order, published) VALUES (?,?,?,?,?,?,?)");
    $stmt->execute([
        $title,
        sanitize($d['tag'] ?? ''),
        sanitize($d['location'] ?? ''),
        sanitize($d['image'] ?? ''),
        sanitize($d['link'] ?? ''),
        intval($d['sort_order'] ?? 0),
        intval($d['published'] ?? 1)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT — update ──
if ($method === 'PUT') {
    requireAdmin();
    $d = getBody();
    $id = intval($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("UPDATE $table SET title=?, tag=?, location=?, image=?, link=?, sort_order=?, published=? WHERE id=?");
    $stmt->execute([
        sanitize($d['title'] ?? ''),
        sanitize($d['tag'] ?? ''),
        sanitize($d['location'] ?? ''),
        sanitize($d['image'] ?? ''),
        sanitize($d['link'] ?? ''),
        intval($d['sort_order'] ?? 0),
        intval($d['published'] ?? 1),
        $id
    ]);
    jsonOk(['updated' => $id]);
}

// ── DELETE ──
if ($method === 'DELETE') {
    requireAdmin();
    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    // Get image path to delete file
    $stmt = $pdo->prepare("SELECT image FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row && $row['image']) {
        $filePath = __DIR__ . '/../../' . $row['image'];
        if (file_exists($filePath) && strpos($row['image'], 'published/') !== false) {
            @unlink($filePath);
        }
    }

    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}
