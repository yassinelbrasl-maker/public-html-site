<?php
// ═══════════════════════════════════════════════════════════════
//  Upload nas-conformite-bridge.html sur le NAS via WebDAV PUT
//  Usage unique pour déployer le fichier bridge
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();

// Lire la config NAS
$db = getDB();
$stmt = $db->prepare("SELECT setting_key, setting_value FROM CDS_settings WHERE setting_key IN (
    'cortoba_nas_local','cortoba_nas_user','cortoba_nas_pass',
    'cortoba_nas_webdav_port','cortoba_nas_public_ip'
)");
$stmt->execute();
$cfg = [];
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $cfg[$row['setting_key']] = $row['setting_value'];
}

$publicIp = trim($cfg['cortoba_nas_public_ip'] ?? '');
$ip = $publicIp;
if (!$ip) {
    $uncPath = $cfg['cortoba_nas_local'] ?? '';
    if (preg_match('/\\\\\\\\([^\\\\]+)/', $uncPath, $m)) {
        $ip = $m[1];
    }
}
if (!$ip) jsonError('IP du NAS non configurée', 500);

$port    = $cfg['cortoba_nas_webdav_port'] ?? '5005';
$nasUser = $cfg['cortoba_nas_user'] ?? '';
$nasPass = $cfg['cortoba_nas_pass'] ?? '';

// Lire le fichier bridge local
$bridgeFile = __DIR__ . '/../nas-conformite-bridge.html';
if (!file_exists($bridgeFile)) jsonError('Fichier bridge non trouvé', 500);
$content = file_get_contents($bridgeFile);

$baseUrl = 'http://' . $ip . ':' . $port;

// 1. Créer le dossier nas-tools s'il n'existe pas
$mkcolUrl = $baseUrl . '/' . rawurlencode('Public') . '/' . rawurlencode('nas-tools');
$ch = curl_init($mkcolUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => 'MKCOL',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
]);
if ($nasUser) {
    curl_setopt($ch, CURLOPT_USERPWD, $nasUser . ':' . $nasPass);
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC | CURLAUTH_DIGEST);
}
curl_exec($ch);
curl_close($ch);

// 2. Uploader le fichier via PUT
$putUrl = $baseUrl . '/' . rawurlencode('Public') . '/' . rawurlencode('nas-tools') . '/' . rawurlencode('nas-conformite-bridge.html');
$ch = curl_init($putUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => 'PUT',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_POSTFIELDS     => $content,
    CURLOPT_HTTPHEADER     => ['Content-Type: text/html; charset=utf-8'],
]);
if ($nasUser) {
    curl_setopt($ch, CURLOPT_USERPWD, $nasUser . ':' . $nasPass);
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC | CURLAUTH_DIGEST);
}
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error    = curl_error($ch);
curl_close($ch);

$ok = in_array($httpCode, [200, 201, 204]);

jsonOk([
    'uploaded' => $ok,
    'http'     => $httpCode,
    'url'      => $putUrl,
    'error'    => $error ?: null,
]);
