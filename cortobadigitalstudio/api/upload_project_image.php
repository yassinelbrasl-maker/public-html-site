<?php
// ============================================================
//  CORTOBA ATELIER — Project Image Upload
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$user = requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['image'])) {
    jsonError('Aucune image envoyée');
}

$uploadDir = realpath(__DIR__ . '/../../') . '/img/Projets/published/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$file = $_FILES['image'];
$ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

if (!in_array($ext, $allowed)) {
    jsonError('Format non supporté. Utilisez JPG, PNG ou WebP.');
}
if ($file['size'] > 10 * 1024 * 1024) {
    jsonError('Image trop volumineuse (max 10 Mo).');
}
if ($file['error'] !== UPLOAD_ERR_OK) {
    jsonError('Erreur upload: code ' . $file['error']);
}

$filename = uniqid('proj_') . '.' . $ext;
$dest = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    jsonError("Erreur lors de l'enregistrement du fichier");
}

jsonOk(['path' => '/img/Projets/published/' . $filename]);
