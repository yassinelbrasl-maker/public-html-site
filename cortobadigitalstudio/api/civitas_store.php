<?php
// ============================================================
//  CORTOBA → CIVITAS : stockage temporaire des données de préremplissage
//  POST  (auth requise) : stocke les données, retourne un token
//  GET   ?token=xxx     : retourne les données (usage unique, expire 30 min)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();   // CORS * déjà défini dans middleware (app.civitas.tn inclus)

$method = $_SERVER['REQUEST_METHOD'];
$token  = $_GET['token'] ?? null;

// Répertoire de stockage temporaire (hors webroot si possible, sinon caché)
$dir = __DIR__ . '/../config/civitas_tmp';
if (!is_dir($dir)) {
    mkdir($dir, 0750, true);
    // .htaccess de sécurité pour bloquer l'accès direct HTTP au dossier
    file_put_contents($dir . '/.htaccess', "Deny from all\n");
}

// Nettoyage des fichiers expirés (> 30 min)
foreach (glob($dir . '/*.json') as $f) {
    if (filemtime($f) < time() - 1800) @unlink($f);
}

// ── POST : stocker les données ────────────────────────────────────────────────
if ($method === 'POST') {
    requireAuth();   // seul un utilisateur Cortoba authentifié peut créer un token
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || !is_array($body)) jsonError('Corps JSON invalide');

    $tok  = bin2hex(random_bytes(16));   // token 32 hex = 128 bits
    $file = $dir . '/' . $tok . '.json';
    file_put_contents($file, json_encode($body, JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'token' => $tok]);
    exit;
}

// ── GET : récupérer les données (pas d'auth — bookmarklet cross-origin) ───────
if ($method === 'GET' && $token) {
    $safe = preg_replace('/[^a-f0-9]/', '', $token);   // sécuriser le nom de fichier
    if (strlen($safe) !== 32) jsonError('Token invalide', 400);
    $file = $dir . '/' . $safe . '.json';
    if (!file_exists($file)) jsonError('Token expiré ou introuvable', 404);
    $data = file_get_contents($file);
    @unlink($file);   // usage unique
    header('Content-Type: application/json; charset=utf-8');
    echo $data;
    exit;
}

jsonError('Requête invalide', 400);
