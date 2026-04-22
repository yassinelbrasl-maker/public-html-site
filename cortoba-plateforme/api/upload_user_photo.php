<?php
// ═══════════════════════════════════════════════════════════════
//  api/upload_user_photo.php — Upload photo de profil membre
//  Accepte : multipart/form-data (image) OU JSON base64 (dataUrl)
//  Retourne : { path: "/img/equipe/<file>.jpg" }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/../config/image_optimizer.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Méthode non supportée', 405);
}

$uploadDir = realpath(__DIR__ . '/../../') . '/img/equipe/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
if (!is_dir($uploadDir)) jsonError('Dossier cible introuvable', 500);

$allowed = array('jpg', 'jpeg', 'png', 'webp');

// ── Mode 1 : multipart/form-data ──
if (!empty($_FILES['image'])) {
    $file = $_FILES['image'];
    if ($file['error'] !== UPLOAD_ERR_OK) jsonError('Erreur upload: code ' . $file['error']);
    if ($file['size'] > 5 * 1024 * 1024)  jsonError('Image trop volumineuse (max 5 Mo)');
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed)) jsonError('Format non supporté');

    $filename = 'user_' . uniqid() . '.' . $ext;
    $dest = $uploadDir . $filename;
    if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError("Erreur d'enregistrement");

    // Team avatars are shown at ~160px max — 512px is more than enough.
    optimizeImage($dest, array('max_width' => 512, 'max_height' => 512, 'quality' => 85));

    jsonOk(array('path' => '/img/equipe/' . $filename));
}

// ── Mode 2 : JSON base64 (dataUrl après crop canvas) ──
$body = getBody();
if (!empty($body['dataUrl'])) {
    $dataUrl = $body['dataUrl'];
    if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#', $dataUrl, $m)) {
        jsonError('dataUrl invalide');
    }
    $ext  = $m[1] === 'jpeg' ? 'jpg' : $m[1];
    $bin  = base64_decode($m[2]);
    if ($bin === false) jsonError('Base64 invalide');
    if (strlen($bin) > 5 * 1024 * 1024) jsonError('Image trop volumineuse (max 5 Mo)');

    $filename = 'user_' . uniqid() . '.' . $ext;
    $dest = $uploadDir . $filename;
    if (file_put_contents($dest, $bin) === false) jsonError("Erreur d'enregistrement");

    // Same cap as the multipart branch — crop dataURL can still be huge.
    optimizeImage($dest, array('max_width' => 512, 'max_height' => 512, 'quality' => 85));

    jsonOk(array('path' => '/img/equipe/' . $filename));
}

jsonError('Aucune image reçue');
