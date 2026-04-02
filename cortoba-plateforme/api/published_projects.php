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
        (slug, title, category, location, country, year, surface, status, services, description, hero_image, gallery_images, grid_class, sort_order, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $slug,
        sanitize($d['title'] ?? ''),
        sanitize($d['category'] ?? 'Résidentiel'),
        sanitize($d['location'] ?? ''),
        sanitize($d['country'] ?? 'Tunisie'),
        sanitize($d['year'] ?? ''),
        sanitize($d['surface'] ?? ''),
        sanitize($d['status'] ?? 'Livré'),
        sanitize($d['services'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        sanitize($d['grid_class'] ?? ''),
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
        hero_image = ?, gallery_images = ?, grid_class = ?, sort_order = ?, published = ?
        WHERE id = ?");
    $stmt->execute([
        $newSlug,
        sanitize($d['title'] ?? ''),
        sanitize($d['category'] ?? 'Résidentiel'),
        sanitize($d['location'] ?? ''),
        sanitize($d['country'] ?? 'Tunisie'),
        sanitize($d['year'] ?? ''),
        sanitize($d['surface'] ?? ''),
        sanitize($d['status'] ?? 'Livré'),
        sanitize($d['services'] ?? ''),
        $d['description'] ?? '',
        $d['hero_image'] ?? '',
        json_encode($d['gallery_images'] ?? [], JSON_UNESCAPED_UNICODE),
        sanitize($d['grid_class'] ?? ''),
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

    $galleryHtml = '';
    foreach ($gallery as $i => $img) {
        $galleryHtml .= '      <img src="' . htmlspecialchars($img) . '" alt="' . htmlspecialchars($p['title']) . '" onclick="openLightbox(' . $i . ')" />' . "\n";
    }

    $descHtml = '';
    foreach ($descParagraphs as $para) {
        $descHtml .= '      <p>' . htmlspecialchars($para) . '</p>' . "\n";
    }

    $heroImg = $p['hero_image'] ?: ($gallery[0] ?? '/img/Projets/p1.jpg');
    $loc = htmlspecialchars($p['location']);
    $country = htmlspecialchars($p['country']);
    $title = htmlspecialchars($p['title']);
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
  <link rel="icon" type="image/png" href="favicon.png" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', sans-serif; background: #fff; color: #222; }
    .project-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 1.2rem 2.5rem; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(0,0,0,0.06); }
    .project-nav a { text-decoration: none; color: #333; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem; transition: color 0.2s; }
    .project-nav a:hover { color: #0a77a1; }
    .project-nav-logo img { height: 44px; }
    .project-hero { height: 90vh; background-image: url('{$heroImg}'); background-size: cover; background-position: center; margin-top: 72px; position: relative; }
    .project-hero-caption { position: absolute; bottom: 2.5rem; left: 2.5rem; color: #fff; font-size: 0.75rem; letter-spacing: 0.1em; opacity: 0.7; }
    .project-content { max-width: 1200px; margin: 0 auto; padding: 5rem 2.5rem; display: grid; grid-template-columns: 1fr 2fr; gap: 6rem; align-items: start; }
    .project-meta { position: sticky; top: 100px; }
    .project-meta-tag { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #0a77a1; margin-bottom: 1rem; }
    .project-meta h1 { font-size: 2.2rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.15; color: #111; margin-bottom: 0.6rem; }
    .project-meta-location { font-size: 1rem; color: #777; margin-bottom: 2.5rem; }
    .project-meta-table { width: 100%; border-collapse: collapse; }
    .project-meta-table tr { border-top: 1px solid #e5e5e5; }
    .project-meta-table td { padding: 0.8rem 0; font-size: 0.85rem; }
    .project-meta-table td:first-child { color: #999; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.72rem; width: 40%; }
    .project-meta-table td:last-child { color: #222; }
    .project-cta { display: inline-block; margin-top: 2.5rem; padding: 0.9rem 2rem; background: #0a77a1; color: #fff; text-decoration: none; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; transition: background 0.3s; }
    .project-cta:hover { background: #055570; }
    .project-description p { font-size: 1.05rem; line-height: 1.85; color: #444; margin-bottom: 1.8rem; }
    .project-description p:first-child { font-size: 1.25rem; color: #222; line-height: 1.7; }
    .project-gallery-section { max-width: 1200px; margin: 0 auto; padding: 0 2.5rem 6rem; }
    .project-gallery-section h2 { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 1.5rem; text-align: left; }
    .project-gallery-grid { column-count: 2; column-gap: 6px; }
    .project-gallery-grid img { width: 100%; display: block; margin-bottom: 6px; cursor: pointer; transition: opacity 0.2s; border-radius: 2px; }
    .project-gallery-grid img:hover { opacity: 0.85; }
    .project-footer { background: #111; color: #fff; text-align: center; padding: 2rem; font-size: 0.85rem; }
    .project-footer a { color: #0a77a1; text-decoration: none; }
    /* Lightbox */
    .lightbox { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.92); align-items:center; justify-content:center; }
    .lightbox.open { display:flex; }
    .lightbox img { max-width:90vw; max-height:88vh; object-fit:contain; border-radius:4px; user-select:none; }
    .lb-close { position:absolute; top:1.2rem; right:1.5rem; background:none; border:none; color:#fff; font-size:2rem; cursor:pointer; opacity:0.7; transition:opacity 0.2s; z-index:10; }
    .lb-close:hover { opacity:1; }
    .lb-arrow { position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.1); border:none; color:#fff; font-size:2.2rem; padding:0.6rem 1rem; cursor:pointer; opacity:0.7; transition:opacity 0.2s; border-radius:4px; z-index:10; }
    .lb-arrow:hover { opacity:1; background:rgba(255,255,255,0.2); }
    .lb-prev { left:1rem; }
    .lb-next { right:1rem; }
    .lb-counter { position:absolute; bottom:1.2rem; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.6); font-size:0.8rem; letter-spacing:0.1em; }
    @media (max-width: 768px) {
      .project-content { grid-template-columns: 1fr; gap: 3rem; padding: 3rem 1.5rem; }
      .project-meta { position: static; }
      .project-hero { height: 60vh; }
      .project-gallery-grid { column-count: 1; }
      .project-nav { padding: 1rem 1.2rem; }
    }
  </style>
</head>
<body>
  <nav class="project-nav">
    <a href="index.html">← <span>Retour aux projets</span></a>
    <a class="project-nav-logo" href="index.html"><img src="img/Copilot_20250803_202525.png" alt="Cortoba Architecture Studio" /></a>
    <a href="index.html#contact">Nous contacter</a>
  </nav>

  <div class="project-hero">
    <span class="project-hero-caption">{$title} · {$loc} · {$year}</span>
  </div>

  <div class="project-content">
    <aside class="project-meta">
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
    </aside>

    <div class="project-description">
{$descHtml}
    </div>
  </div>

  <div class="project-gallery-section">
    <h2>Galerie photos</h2>
    <div class="project-gallery-grid">
{$galleryHtml}
    </div>
  </div>

  <footer class="project-footer">
    <p>&copy; 2026 Cortoba Architecture Studio · <a href="index.html">Retour au site</a></p>
  </footer>

  <!-- Lightbox -->
  <div class="lightbox" id="lb" onclick="closeLightbox(event)">
    <button class="lb-close" onclick="closeLightbox()">&times;</button>
    <button class="lb-arrow lb-prev" onclick="lbNav(event,-1)">&#8249;</button>
    <img id="lbImg" src="" alt="" />
    <button class="lb-arrow lb-next" onclick="lbNav(event,1)">&#8250;</button>
    <div class="lb-counter" id="lbCounter"></div>
  </div>
  <script>
    var lbImages = Array.from(document.querySelectorAll('.project-gallery-grid img')).map(function(i){ return i.src; });
    var lbIdx = 0;
    function openLightbox(i){ lbIdx=i; updateLb(); document.getElementById('lb').classList.add('open'); document.body.style.overflow='hidden'; }
    function closeLightbox(e){ if(e && e.target && e.target.tagName==='IMG') return; document.getElementById('lb').classList.remove('open'); document.body.style.overflow=''; }
    function lbNav(e,d){ e.stopPropagation(); lbIdx=(lbIdx+d+lbImages.length)%lbImages.length; updateLb(); }
    function updateLb(){ document.getElementById('lbImg').src=lbImages[lbIdx]; document.getElementById('lbCounter').textContent=(lbIdx+1)+' / '+lbImages.length; }
    document.addEventListener('keydown',function(e){ if(!document.getElementById('lb').classList.contains('open')) return; if(e.key==='Escape') closeLightbox(); if(e.key==='ArrowRight') { lbIdx=(lbIdx+1)%lbImages.length; updateLb(); } if(e.key==='ArrowLeft') { lbIdx=(lbIdx-1+lbImages.length)%lbImages.length; updateLb(); } });
  </script>
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
