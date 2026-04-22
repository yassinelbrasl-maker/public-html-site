<?php
// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — api/nas-mkdir.php
//  Proxy : crée un dossier sur le NAS QNAP via WebDAV MKCOL
//  Le serveur distant appelle le NAS via l'IP publique (port forwardé)
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();
$body = getBody();

$folderName = trim($body['folder'] ?? '');
$annee      = trim($body['annee'] ?? date('Y'));

if (!$folderName) jsonError('Nom du dossier requis', 400);

// Sécurité : bloquer traversée de répertoire
if (strpos($folderName, '..') !== false) jsonError('Chemin non autorisé', 400);

// Lire la config NAS depuis CDS_settings
$db = getDB();
$stmt = $db->prepare("SELECT setting_key, setting_value FROM CDS_settings WHERE setting_key IN (
    'cortoba_nas_local','cortoba_nas_user','cortoba_nas_pass',
    'cortoba_nas_webdav_port','cortoba_nas_projets_root','cortoba_nas_public_ip'
)");
$stmt->execute();
$cfg = [];
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $cfg[$row['setting_key']] = $row['setting_value'];
}

// Déterminer l'IP à utiliser (publique d'abord, sinon locale extraite du UNC)
$publicIp = trim($cfg['cortoba_nas_public_ip'] ?? '');
$ip = $publicIp;

if (!$ip) {
    // Extraire IP du chemin UNC \\192.168.1.165\Public\...
    $uncPath = $cfg['cortoba_nas_local'] ?? '';
    if (preg_match('/\\\\\\\\([^\\\\]+)/', $uncPath, $m)) {
        $ip = $m[1];
    }
}

if (!$ip) jsonError('IP du NAS non configurée. Allez dans Paramètres → Serveur NAS.', 500);

$port     = $cfg['cortoba_nas_webdav_port'] ?? '5005';
$nasUser  = $cfg['cortoba_nas_user'] ?? '';
$nasPass  = $cfg['cortoba_nas_pass'] ?? '';
$rootPath = rtrim($cfg['cortoba_nas_projets_root'] ?? '/Public/CAS_PROJETS', '/');

// Nettoyer le nom du dossier
$folderName = preg_replace('/[<>:"\/\\\\|?*]/', '_', $folderName);

$baseUrl = 'http://' . $ip . ':' . $port;

// Fonction MKCOL WebDAV
function webdav_mkcol(string $url, string $user, string $pass): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'MKCOL',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    if ($user) {
        curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC | CURLAUTH_DIGEST);
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    $errno    = curl_errno($ch);
    curl_close($ch);
    return [
        'http'  => $httpCode,
        'ok'    => in_array($httpCode, [201, 301, 405]), // 201=créé, 405=existe déjà
        'error' => $error ?: null,
        'errno' => $errno,
    ];
}

// Encoder chaque segment du chemin
function encode_webdav_path(string $path): string {
    return implode('/', array_map('rawurlencode', array_filter(explode('/', $path))));
}

$results = [];

// 1. Créer le dossier année
$yearPath = $rootPath . '/' . $annee;
$yearUrl  = $baseUrl . '/' . encode_webdav_path($yearPath);
$r1 = webdav_mkcol($yearUrl, $nasUser, $nasPass);
$results[] = ['path' => $yearPath, 'url' => $yearUrl] + $r1;

// 2. Créer le dossier projet
$projectPath = $rootPath . '/' . $annee . '/' . $folderName;
$projectUrl  = $baseUrl . '/' . encode_webdav_path($projectPath);
$r2 = webdav_mkcol($projectUrl, $nasUser, $nasPass);
$results[] = ['path' => $projectPath, 'url' => $projectUrl] + $r2;

// Résultat
$allOk = $r2['ok'];
jsonOk([
    'created' => $allOk,
    'path'    => $projectPath,
    'folder'  => $folderName,
    'ip_used' => $ip,
    'details' => $results,
]);
