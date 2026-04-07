<?php
// ═══════════════════════════════════════════════════════════════
//  api/upload_client_file.php — Upload fichier pour le portail client
//  Accepte : multipart/form-data (file)
//  Auth : JWT client (type='client')
//  Retourne : { url, name, size }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$payload = requireAuth();
if (($payload['type'] ?? '') !== 'client') {
    jsonError('Acces client requis', 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Methode non supportee', 405);
}

$uploadDir = realpath(__DIR__ . '/../../') . '/img/client_docs/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
if (!is_dir($uploadDir)) jsonError('Dossier cible introuvable', 500);

$allowed = ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx','pptx','dwg','dxf','zip','rar','7z','txt','csv'];

if (empty($_FILES['file'])) jsonError('Aucun fichier recu');
$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) jsonError('Erreur upload: code ' . $file['error']);
if ($file['size'] > 20 * 1024 * 1024) jsonError('Fichier trop volumineux (max 20 Mo)');

$origName = $file['name'];
$ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
if (!in_array($ext, $allowed)) jsonError('Format non supporte (' . $ext . ')');

$filename = 'cdoc_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$dest = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError("Erreur d'enregistrement");

jsonOk([
    'url'  => '/img/client_docs/' . $filename,
    'name' => $origName,
    'size' => $file['size']
]);
