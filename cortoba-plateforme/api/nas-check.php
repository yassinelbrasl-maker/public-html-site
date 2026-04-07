<?php
// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — api/nas-check.php
//  Liste les dossiers projets sur le NAS via WebDAV PROPFIND
//  pour comparaison avec les projets de la plateforme
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();

// Lire la config NAS depuis CA_settings
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

// Déterminer l'IP
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

// Année demandée (optionnel, sinon toutes)
$annee = isset($_GET['annee']) ? trim($_GET['annee']) : '';

// Fonction PROPFIND WebDAV pour lister les dossiers
function webdav_propfind(string $url, string $user, string $pass, int $depth = 1): array {
    $xml = '<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_POSTFIELDS     => $xml,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/xml',
            'Depth: ' . $depth,
        ],
    ]);
    if ($user) {
        curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC | CURLAUTH_DIGEST);
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    return [
        'http'     => $httpCode,
        'ok'       => in_array($httpCode, [207, 200]),
        'response' => $response,
        'error'    => $error ?: null,
    ];
}

// Encoder chaque segment du chemin
function encode_path(string $path): string {
    return implode('/', array_map('rawurlencode', array_filter(explode('/', $path))));
}

// Parser la réponse PROPFIND et extraire les noms de dossiers
function parse_folders(string $xml, string $basePath): array {
    $folders = [];
    // Supprimer les namespaces pour simplifier le parsing
    $xml = preg_replace('/(<\/?)(\w+):/', '$1$2_', $xml);
    $doc = @simplexml_load_string($xml);
    if (!$doc) return $folders;

    foreach ($doc->children() as $response) {
        $href = (string)($response->D_href ?? $response->d_href ?? '');
        // Vérifier que c'est un dossier (collection)
        $isCollection = false;
        $propstat = $response->D_propstat ?? $response->d_propstat ?? null;
        if ($propstat) {
            $prop = $propstat->D_prop ?? $propstat->d_prop ?? null;
            if ($prop) {
                $rt = $prop->D_resourcetype ?? $prop->d_resourcetype ?? null;
                if ($rt) {
                    $inner = $rt->asXML();
                    if (stripos($inner, 'collection') !== false) {
                        $isCollection = true;
                    }
                }
            }
        }

        if (!$isCollection) continue;

        // Extraire le nom du dossier depuis le href
        $decoded = rawurldecode($href);
        $decoded = rtrim($decoded, '/');
        $name = basename($decoded);

        // Ignorer le dossier racine lui-même
        $baseDecoded = rtrim(rawurldecode($basePath), '/');
        if ($decoded === $baseDecoded || $decoded === '') continue;

        if ($name && $name !== '.' && $name !== '..') {
            $folders[] = $name;
        }
    }
    return $folders;
}

$result = [];

// Si une année spécifique est demandée, lister les dossiers de cette année
// Sinon, lister d'abord les années, puis les dossiers de chaque année
if ($annee) {
    $yearPath = $rootPath . '/' . $annee;
    $yearUrl  = $baseUrl . '/' . encode_path($yearPath);
    $r = webdav_propfind($yearUrl, $nasUser, $nasPass);
    if ($r['ok'] && $r['response']) {
        $folders = parse_folders($r['response'], $yearPath);
        $result[$annee] = $folders;
    } else {
        $result[$annee] = [];
    }
} else {
    // Lister les dossiers-années
    $rootUrl = $baseUrl . '/' . encode_path($rootPath);
    $r = webdav_propfind($rootUrl, $nasUser, $nasPass);
    if (!$r['ok']) {
        jsonError('Impossible de lister le NAS : ' . ($r['error'] ?: 'HTTP ' . $r['http']), 500);
    }
    $years = parse_folders($r['response'], $rootPath);

    // Pour chaque année, lister les dossiers projets
    foreach ($years as $year) {
        if (!preg_match('/^20\d{2}$/', $year)) continue; // ignorer les non-années
        $yearPath = $rootPath . '/' . $year;
        $yearUrl  = $baseUrl . '/' . encode_path($yearPath);
        $ry = webdav_propfind($yearUrl, $nasUser, $nasPass);
        if ($ry['ok'] && $ry['response']) {
            $result[$year] = parse_folders($ry['response'], $yearPath);
        }
    }
}

// Charger aussi les projets de la plateforme pour la comparaison côté serveur
$projets = [];
$stmtP = $db->query("SELECT id, code, nom, annee, statut FROM CA_projets ORDER BY annee DESC, code ASC");
if ($stmtP) {
    $projets = $stmtP->fetchAll(PDO::FETCH_ASSOC);
}

jsonOk([
    'nas_folders' => $result,
    'projets'     => $projets,
    'nas_ip'      => $ip,
    'root_path'   => $rootPath,
]);
