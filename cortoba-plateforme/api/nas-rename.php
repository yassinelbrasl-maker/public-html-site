<?php
// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — api/nas-rename.php
//  Proxy : renomme un dossier sur le NAS QNAP via WebDAV MOVE
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();
$body = getBody();

$oldName = trim($body['oldName'] ?? '');
$newName = trim($body['newName'] ?? '');
$annee   = trim($body['annee'] ?? date('Y'));

if (!$oldName || !$newName) jsonError('Ancien et nouveau nom requis', 400);
if (strpos($oldName, '..') !== false || strpos($newName, '..') !== false) jsonError('Chemin non autorisé', 400);

// Lire la config NAS
$db = getDB();
$stmt = $db->prepare("SELECT setting_key, setting_value FROM CA_settings WHERE setting_key IN (
    'cortoba_nas_local','cortoba_nas_user','cortoba_nas_pass',
    'cortoba_nas_webdav_port','cortoba_nas_projets_root','cortoba_nas_public_ip'
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

$port     = $cfg['cortoba_nas_webdav_port'] ?? '5005';
$nasUser  = $cfg['cortoba_nas_user'] ?? '';
$nasPass  = $cfg['cortoba_nas_pass'] ?? '';
$rootPath = rtrim($cfg['cortoba_nas_projets_root'] ?? '/Public/CAS_PROJETS', '/');

$baseUrl = 'http://' . $ip . ':' . $port;

// Encoder les segments du chemin
function encode_webdav_segments(string $path): string {
    return implode('/', array_map('rawurlencode', array_filter(explode('/', $path))));
}

// Nettoyer le nouveau nom
$newName = preg_replace('/[<>:"\/\\\\|?*]/', '_', $newName);

$srcPath = $rootPath . '/' . $annee . '/' . $oldName;
$dstPath = $rootPath . '/' . $annee . '/' . $newName;
$srcUrl  = $baseUrl . '/' . encode_webdav_segments($srcPath);
$dstUrl  = $baseUrl . '/' . encode_webdav_segments($dstPath);

// WebDAV MOVE
$ch = curl_init($srcUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => 'MOVE',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_HTTPHEADER     => [
        'Destination: ' . $dstUrl,
        'Overwrite: F',
    ],
]);
if ($nasUser) {
    curl_setopt($ch, CURLOPT_USERPWD, $nasUser . ':' . $nasPass);
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC | CURLAUTH_DIGEST);
}
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error    = curl_error($ch);
curl_close($ch);

$ok = in_array($httpCode, [201, 204]);

jsonOk([
    'renamed' => $ok,
    'oldName' => $oldName,
    'newName' => $newName,
    'http'    => $httpCode,
    'error'   => $error ?: null,
]);
