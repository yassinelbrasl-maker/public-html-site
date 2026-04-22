<?php
// ============================================================
//  CORTOBA ATELIER — Upload justificatif demande administrative
//  Stocké dans /img/da_justifs/ avec lien retourné
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['file'])) {
    jsonError('Aucun fichier envoyé');
}

$uploadDir = realpath(__DIR__ . '/../../') . '/img/da_justifs/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

$file = $_FILES['file'];
$ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

if (!in_array($ext, $allowed)) {
    jsonError('Format non supporté (JPG/PNG/WebP/PDF).');
}
if ($file['size'] > 15 * 1024 * 1024) {
    jsonError('Fichier trop volumineux (max 15 Mo).');
}
if ($file['error'] !== UPLOAD_ERR_OK) {
    jsonError('Erreur upload: code ' . $file['error']);
}

$demandeId = isset($_POST['demande_id']) ? preg_replace('/[^a-f0-9]/', '', $_POST['demande_id']) : '';
$base = $demandeId ? ('da_' . $demandeId . '_' . time()) : uniqid('da_');
$filename = $base . '.' . $ext;
$dest = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    jsonError("Erreur lors de l'enregistrement du fichier");
}

$url = '/img/da_justifs/' . $filename;

// Si un demande_id est fourni, mettre à jour la colonne justificatif_url
if ($demandeId) {
    try {
        $db = getDB();
        $db->prepare('UPDATE CDS_demandes_admin SET justificatif_url = ?, date_depot = COALESCE(date_depot, CURDATE()) WHERE id = ?')
           ->execute([$url, $demandeId]);
    } catch (\Throwable $e) {}
}

jsonOk(['url' => $url, 'filename' => $filename]);
