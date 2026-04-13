<?php
// ============================================================
//  CORTOBA ATELIER — Published Projects API (public site)
//  CRUD + image upload + static HTML generation
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDB();
$table  = t('published_projects');

// ── Public endpoint: list published projects (no auth) ──
if ($method === 'GET' && empty($_GET['id']) && empty($_GET['admin'])) {
    $rows = $pdo->query("SELECT * FROM $table WHERE published = 1 ORDER BY sort_order ASC, id DESC")->fetchAll();
    foreach ($rows as &$r) {
        $r['gallery_images'] = json_decode($r['gallery_images'] ?: '[]', true);
    }
    jsonOk($rows);
}

// ── All other endpoints require admin auth ──
if ($method !== 'GET' || !empty($_GET['admin'])) {
    $user = requireAdmin();
}

// ── GET ?admin=1  → list all (including unpublished) ──
if ($method === 'GET' && !empty($_GET['admin'])) {
    $rows = $pdo->query("SELECT * FROM $table ORDER BY sort_order ASC, id DESC")->fetchAll();
    foreach ($rows as &$r) {
        $r['gallery_images'] = json_decode($r['gallery_images'] ?: '[]', true);
    }
    jsonOk($rows);
}

// ── GET ?id=X  → single project ──
if ($method === 'GET' && !empty($_GET['id'])) {
    $stmt = $pdo->prepare("SELECT * FROM $table WHERE id = ?");
    $stmt->execute([(int)$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Projet non trouvé', 404);
    $row['gallery_images'] = json_decode($row['gallery_images'] ?: '[]', true);
    jsonOk($row);
}

// ── POST → create project ──
if ($method === 'POST') {
    $d = getBody();
    $slug = slugify($d['title'] ?? 'projet');

    // Ensure unique slug
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM $table WHERE slug = ?");
    $stmt->execute([$slug]);
    if ($stmt->fetchColumn() > 0) {
        $slug .= '-' . time();
    }

    $stmt = $pdo->prepare("INSERT INTO $table
        (slug, title, category, location, country, year, surface, status, services, description, hero_image, hero_position, gallery_images, grid_class, sort_order, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $slug,
        trim($d['title'] ?? ''),
        trim($d['category'] ?? 'Résidentiel'),
        trim($d['location'] ?? ''),
        trim($d['country'] ?? 'Tunisie'),
        trim($d['year'] ?? ''),
        trim($d['surface'] ?? ''),
        trim($d['status'] ?? 'Livré'),
        trim($d['services'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        (int)($d['hero_position'] ?? 50),
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        trim($d['grid_class'] ?? ''),
        (int)($d['sort_order'] ?? 0),
        (int)($d['published'] ?? 1)
    ]);
    $id = $pdo->lastInsertId();

    // Generate static HTML
    generateProjectHTML($pdo, $id, $table);
    regenerateIndexGrid($pdo, $table);

    jsonOk(['id' => $id, 'slug' => $slug], 201);
}

// ── PUT → update project ──
if ($method === 'PUT') {
    $d = getBody();
    $id = (int)($d['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    // Get current slug
    $stmt = $pdo->prepare("SELECT slug FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) jsonError('Projet non trouvé', 404);

    $newSlug = slugify($d['title'] ?? 'projet');
    if ($newSlug !== $old['slug']) {
        $check = $pdo->prepare("SELECT COUNT(*) FROM $table WHERE slug = ? AND id != ?");
        $check->execute([$newSlug, $id]);
        if ($check->fetchColumn() > 0) $newSlug .= '-' . time();

        // Delete old HTML file
        $oldFile = realpath(__DIR__ . '/../../') . '/projet-' . $old['slug'] . '.html';
        if (file_exists($oldFile)) unlink($oldFile);
    }

    $stmt = $pdo->prepare("UPDATE $table SET
        slug = ?, title = ?, category = ?, location = ?, country = ?,
        year = ?, surface = ?, status = ?, services = ?, description = ?,
        hero_image = ?, hero_position = ?, gallery_images = ?, grid_class = ?, sort_order = ?, published = ?
        WHERE id = ?");
    $stmt->execute([
        $newSlug,
        trim($d['title'] ?? ''),
        trim($d['category'] ?? 'Résidentiel'),
        trim($d['location'] ?? ''),
        trim($d['country'] ?? 'Tunisie'),
        trim($d['year'] ?? ''),
        trim($d['surface'] ?? ''),
        trim($d['status'] ?? 'Livré'),
        trim($d['services'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        (int)($d['hero_position'] ?? 50),
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        trim($d['grid_class'] ?? ''),
        (int)($d['sort_order'] ?? 0),
        (int)($d['published'] ?? 1),
        $id
    ]);

    generateProjectHTML($pdo, $id, $table);
    regenerateIndexGrid($pdo, $table);

    jsonOk(['id' => $id, 'slug' => $newSlug]);
}

// ── DELETE → remove project ──
if ($method === 'DELETE') {
    $d = getBody();
    $id = (int)($d['id'] ?? $_GET['id'] ?? 0);
    if (!$id) jsonError('ID requis');

    $stmt = $pdo->prepare("SELECT slug, hero_image, gallery_images FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Projet non trouvé', 404);

    // Delete HTML file
    $rootDir = realpath(__DIR__ . '/../../');
    $htmlFile = $rootDir . '/projet-' . $row['slug'] . '.html';
    if (file_exists($htmlFile)) unlink($htmlFile);

    // Delete uploaded images
    $images = json_decode($row['gallery_images'] ?: '[]', true);
    if ($row['hero_image']) $images[] = $row['hero_image'];
    foreach ($images as $img) {
        $imgPath = $rootDir . '/' . ltrim($img, '/');
        if (file_exists($imgPath)) unlink($imgPath);
    }

    $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
    $stmt->execute([$id]);

    regenerateIndexGrid($pdo, $table);

    jsonOk(['deleted' => $id]);
}

// ============================================================
//  IMAGE UPLOAD (multipart/form-data)
// ============================================================
if ($method === 'POST' && !empty($_FILES['image'])) {
    $user = requireAdmin();

    $uploadDir = realpath(__DIR__ . '/../../') . '/img/Projets/published/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $file = $_FILES['image'];
    $ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

    if (!in_array($ext, $allowed)) jsonError('Format non supporté. Utilisez JPG, PNG ou WebP.');
    if ($file['size'] > 10 * 1024 * 1024) jsonError('Image trop volumineuse (max 10 Mo).');

    $filename = uniqid('proj_') . '.' . $ext;
    $dest = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        jsonError('Erreur lors de l\'upload');
    }

    jsonOk(['path' => '/img/Projets/published/' . $filename]);
}


// ============================================================
//  HELPERS
// ============================================================

function slugify(string $text): string {
    $text = mb_strtolower($text, 'UTF-8');
    $text = preg_replace('/[àáâãäå]/u', 'a', $text);
    $text = preg_replace('/[èéêë]/u', 'e', $text);
    $text = preg_replace('/[ìíîï]/u', 'i', $text);
    $text = preg_replace('/[òóôõö]/u', 'o', $text);
    $text = preg_replace('/[ùúûü]/u', 'u', $text);
    $text = preg_replace('/[ç]/u', 'c', $text);
    $text = preg_replace('/[^a-z0-9]+/', '-', $text);
    return trim($text, '-');
}

function generateProjectHTML(PDO $pdo, int $id, string $table): void {
    $stmt = $pdo->prepare("SELECT * FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $p = $stmt->fetch();
    if (!$p || !$p['published']) return;

    $gallery = json_decode($p['gallery_images'] ?: '[]', true);
    $descParagraphs = array_filter(array_map('trim', explode("\n", $p['description'] ?? '')));

    $photosHtml = '';
    foreach ($gallery as $img) {
        $photosHtml .= '      <img src="' . htmlspecialchars($img) . '" alt="' . htmlspecialchars($p['title']) . '" />' . "\n";
    }

    $descHtml = '';
    foreach ($descParagraphs as $para) {
        $descHtml .= '          <p>' . htmlspecialchars($para) . '</p>' . "\n";
    }

    $heroImg = $p['hero_image'] ?: ($gallery[0] ?? '/img/Projets/p1.jpg');
    $rawPos = (int)($p['hero_position'] ?? 50);
    $heroPosX = $rawPos > 100 ? ($rawPos % 1000) : 50;
    $heroPos = $rawPos > 100 ? intdiv($rawPos, 1000) : $rawPos;
    $loc = htmlspecialchars($p['location']);
    $country = htmlspecialchars($p['country']);
    $title = htmlspecialchars($p['title']);
    $slug = htmlspecialchars($p['slug']);
    $category = htmlspecialchars($p['category']);
    $year = htmlspecialchars($p['year']);
    $surface = htmlspecialchars($p['surface']);
    $status = htmlspecialchars($p['status']);
    $services = htmlspecialchars($p['services']);

    $html = <<<HTML
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{$title} — Cortoba Architecture Studio</title>
  <link rel="stylesheet" href="css/project-page.css" />
  <link rel="icon" type="image/png" href="favicon.png" />
</head>
<body data-project-slug="{$slug}">

  <nav class="project-nav">
    <a href="index.html">← <span>Retour aux projets</span></a>
    <a class="project-nav-logo" href="index.html"><img src="img/Copilot_20250803_202525.png" alt="Cortoba Architecture Studio" /></a>
    <a href="index.html#contact">Nous contacter</a>
  </nav>

  <div class="project-hero">
    <img src="{$heroImg}" alt="{$title}" style="object-position:50% {$heroPos}%" />
    <div class="project-hero-overlay">
      <span class="project-hero-caption">{$title} · {$loc} · {$year}</span>
      <span class="project-hero-hint">Cliquez pour explorer les photos</span>
    </div>
  </div>

  <div class="project-main">
    <aside class="project-sidebar">
      <div class="project-sidebar-inner">
        <p class="project-meta-tag">{$category}</p>
        <h1>{$title}</h1>
        <p class="project-meta-location">{$loc} — {$country}</p>
        <table class="project-meta-table">
          <tr><td>Année</td><td>{$year}</td></tr>
          <tr><td>Surface</td><td>{$surface}</td></tr>
          <tr><td>Statut</td><td>{$status}</td></tr>
          <tr><td>Services</td><td>{$services}</td></tr>
          <tr><td>Localisation</td><td>{$loc}</td></tr>
        </table>
        <a href="index.html#contact" class="project-cta">Démarrer un projet similaire</a>
        <div class="project-description">
{$descHtml}
        </div>
      </div>
    </aside>
    <div class="project-photos">
{$photosHtml}
    </div>
  </div>

  <section class="other-projects">
    <h2>Autres projets</h2>
    <div class="other-projects-grid" id="otherProjectsGrid"></div>
  </section>

  <footer class="project-footer">
    <p>&copy; 2026 Cortoba Architecture Studio · <a href="index.html">Retour au site</a></p>
  </footer>

  <script src="js/project-page.js"></script>
</body>
</html>
HTML;

    $rootDir = realpath(__DIR__ . '/../../');
    file_put_contents($rootDir . '/projet-' . $p['slug'] . '.html', $html);
}

function regenerateIndexGrid(PDO $pdo, string $table): void {
    $rows = $pdo->query("SELECT * FROM $table WHERE published = 1 ORDER BY sort_order ASC, id DESC")->fetchAll();

    $gridHtml = '';
    foreach ($rows as $r) {
        $gallery = json_decode($r['gallery_images'] ?: '[]', true);
        $heroImg = $r['hero_image'] ?: ($gallery[0] ?? '/img/Projets/p1.jpg');
        $cls = $r['grid_class'] ? ' project-card-' . htmlspecialchars($r['grid_class']) : '';
        $title = htmlspecialchars($r['title']);
        $loc   = htmlspecialchars($r['location'] . ', ' . $r['country']);
        $cat   = htmlspecialchars($r['category']);
        $slug  = htmlspecialchars($r['slug']);

        $gridHtml .= <<<CARD

        <a href="projet-{$slug}.html" class="project-card-link{$cls}">
          <div class="project-card-img" style="background-image: url('{$heroImg}')">
            <div class="project-card-overlay">
              <span class="project-tag">{$cat}</span>
              <h3 class="project-card-title">{$title}</h3>
              <p class="project-card-loc">{$loc}</p>
            </div>
          </div>
        </a>
CARD;
    }

    // Write a JSON file that the frontend can fetch
    $rootDir = realpath(__DIR__ . '/../../');
    file_put_contents($rootDir . '/projects-grid.json', json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}
