<?php
// ============================================================
//  CORTOBA LANDSCAPING — Projects API
//  Full featured: hero image + position, gallery, description
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('landscaping_projects');

// Auto-create table
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . DB_PREFIX . "landscaping_projects (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        title           VARCHAR(200) NOT NULL,
        tag             VARCHAR(100) DEFAULT '',
        location        VARCHAR(200) DEFAULT '',
        year            VARCHAR(10) DEFAULT '',
        surface         VARCHAR(50) DEFAULT '',
        description     TEXT,
        hero_image      VARCHAR(300) DEFAULT '',
        hero_position   INT DEFAULT 50,
        gallery_images  JSON,
        link            VARCHAR(300) DEFAULT '',
        grid_class      VARCHAR(30) DEFAULT '',
        sort_order      INT DEFAULT 0,
        published       TINYINT(1) DEFAULT 1,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Auto-add columns if missing (existing installs)
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN year VARCHAR(10) DEFAULT '' AFTER location"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN surface VARCHAR(50) DEFAULT '' AFTER year"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN description TEXT AFTER surface"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN hero_image VARCHAR(300) DEFAULT '' AFTER description"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN hero_position INT DEFAULT 50 AFTER hero_image"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN gallery_images JSON AFTER hero_position"); } catch (Exception $ignore) {}
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects ADD COLUMN grid_class VARCHAR(30) DEFAULT '' AFTER link"); } catch (Exception $ignore) {}
    // Rename old 'image' column to hero_image if it exists
    try { $pdo->exec("ALTER TABLE " . DB_PREFIX . "landscaping_projects CHANGE COLUMN image hero_image VARCHAR(300) DEFAULT ''"); } catch (Exception $ignore) {}
} catch (Exception $e) {}

// ── GET (public) ──
if ($method === 'GET' && empty($_GET['admin'])) {
    $rows = $pdo->query("SELECT * FROM $table WHERE published = 1 ORDER BY sort_order ASC, id ASC")->fetchAll();
    foreach ($rows as &$r) {
        $r['gallery_images'] = json_decode($r['gallery_images'] ?: '[]', true);
    }
    jsonOk($rows);
}

// ── All other endpoints require admin auth ──
if ($method !== 'GET' || !empty($_GET['admin'])) {
    $user = requireAdmin();
}

// ── GET ?admin=1 → all projects ──
if ($method === 'GET' && !empty($_GET['admin'])) {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    foreach ($rows as &$r) {
        $r['gallery_images'] = json_decode($r['gallery_images'] ?: '[]', true);
    }
    jsonOk($rows);
}

// ── POST — create ──
if ($method === 'POST') {
    $d = getBody();
    $title = sanitize($d['title'] ?? '');
    if (!$title) jsonError('Titre requis');

    $stmt = $pdo->prepare("INSERT INTO $table (title, tag, location, year, surface, description, hero_image, hero_position, gallery_images, link, grid_class, sort_order, published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $stmt->execute([
        $title,
        sanitize($d['tag'] ?? ''),
        sanitize($d['location'] ?? ''),
        sanitize($d['year'] ?? ''),
        sanitize($d['surface'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        (int)($d['hero_position'] ?? 50),
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        sanitize($d['link'] ?? ''),
        sanitize($d['grid_class'] ?? ''),
        (int)($d['sort_order'] ?? 0),
        (int)($d['published'] ?? 1)
    ]);
    jsonOk(['id' => $pdo->lastInsertId()], 201);
}

// ── PUT — update ──
if ($method === 'PUT') {
    $d = getBody();
    $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("UPDATE $table SET title=?, tag=?, location=?, year=?, surface=?, description=?, hero_image=?, hero_position=?, gallery_images=?, link=?, grid_class=?, sort_order=?, published=? WHERE id=?");
    $stmt->execute([
        sanitize($d['title'] ?? ''),
        sanitize($d['tag'] ?? ''),
        sanitize($d['location'] ?? ''),
        sanitize($d['year'] ?? ''),
        sanitize($d['surface'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        (int)($d['hero_position'] ?? 50),
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        sanitize($d['link'] ?? ''),
        sanitize($d['grid_class'] ?? ''),
        (int)($d['sort_order'] ?? 0),
        (int)($d['published'] ?? 1),
        $id
    ]);
    jsonOk(['updated' => $id]);
}

// ── DELETE ──
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("SELECT hero_image, gallery_images FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row) {
        // Delete hero image
        if ($row['hero_image'] && strpos($row['hero_image'], 'published/') !== false) {
            $filePath = realpath(__DIR__ . '/../../') . '/' . ltrim($row['hero_image'], '/');
            if (file_exists($filePath)) @unlink($filePath);
        }
        // Delete gallery images
        $gallery = json_decode($row['gallery_images'] ?: '[]', true);
        foreach ($gallery as $img) {
            if ($img && strpos($img, 'published/') !== false) {
                $filePath = realpath(__DIR__ . '/../../') . '/' . ltrim($img, '/');
                if (file_exists($filePath)) @unlink($filePath);
            }
        }
    }

    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}
