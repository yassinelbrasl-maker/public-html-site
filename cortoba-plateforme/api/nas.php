<?php
// ═══════════════════════════════════════════════════════════════
//  api/nas.php — Proxy NAS QNAP pour Cortoba Atelier
//  Compatible PHP 5.6+
//  Actions : status | files | ping
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

$action = isset($_GET['action']) ? $_GET['action'] : 'status';

// ── Lire la config NAS depuis les paramètres (CA_settings) ──
function getNasParam($key, $default = '') {
    $db = getDB();
    // Chercher d'abord dans CA_settings (source de vérité, utilisée par saveSetting JS)
    try {
        $stmt = $db->prepare('SELECT setting_value FROM CA_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute(array($key));
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $decoded = json_decode($row['setting_value'], true);
            return ($decoded !== null) ? $decoded : $row['setting_value'];
        }
    } catch (Exception $e) {}
    // Fallback sur CA_parametres (ancien schéma)
    try {
        $stmt = $db->prepare('SELECT valeur FROM CA_parametres WHERE cle = ? LIMIT 1');
        $stmt->execute(array($key));
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $decoded = json_decode($row['valeur'], true);
            return ($decoded !== null) ? $decoded : $row['valeur'];
        }
    } catch (Exception $e) {}
    return $default;
}

// ── Helper : requête cURL ──
function curlGet($url, $user = '', $pass = '', $timeout = 5) {
    if (!function_exists('curl_init')) return false;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    if ($user) curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false) return false;
    return array('body' => $response, 'code' => $httpCode, 'error' => $error);
}

// ── Helper : extraire IP pure d'un champ qui peut contenir un chemin UNC ──
function extractIp($val) {
    if (!$val) return '';
    $val = trim($val);
    // Si c'est une URL (https://...), ne pas modifier
    if (strpos($val, 'http') === 0) return '';
    // Nettoyer les backslashes
    $val = str_replace('\\', '/', $val);
    $val = ltrim($val, '/');
    // Extraire l'IP (première partie avant /)
    if (preg_match('/^(\d+\.\d+\.\d+\.\d+)/', $val, $m)) return $m[1];
    // Si c'est un hostname simple
    $parts = explode('/', $val);
    return $parts[0];
}

// ── ACTION : status ──
if ($action === 'status') {
    $ip       = getNasParam('cortoba_nas_local', '192.168.1.100');
    $port     = getNasParam('cortoba_nas_port', '8080');
    $user     = getNasParam('cortoba_nas_user', 'admin');
    $pass     = getNasParam('cortoba_nas_pass', '');
    $model    = getNasParam('cortoba_nas_model', 'QNAP NAS');
    $capacity = (float) getNasParam('cortoba_nas_capacity', 0);
    $used     = (float) getNasParam('cortoba_nas_used', 0);

    $online   = false;
    $latency  = 0;
    $realData = array();

    // Tentative connexion API QTS locale
    if ($ip && $port && $user && $pass) {
        $start = microtime(true);
        // Authentification QTS
        $loginUrl = 'http://' . $ip . ':' . $port . '/cgi-bin/authLogin.cgi?user=' . urlencode($user) . '&pwd=' . urlencode(base64_encode($pass));
        $res = curlGet($loginUrl, '', '', 3);
        $latency = round((microtime(true) - $start) * 1000);

        if ($res !== false && $res['code'] === 200) {
            $online = true;
            // Parser le XML de réponse QTS pour extraire authSid
            if (preg_match('/<authSid>(.*?)<\/authSid>/', $res['body'], $m)) {
                $sid = $m[1];
                // Récupérer les infos système
                $sysUrl = 'http://' . $ip . ':' . $port . '/cgi-bin/management/manaRequest.cgi?subfunc=sysinfo&sid=' . $sid;
                $sysRes = curlGet($sysUrl, '', '', 4);
                if ($sysRes && $sysRes['code'] === 200) {
                    // Parser les infos de stockage
                    if (preg_match('/<modelName>(.*?)<\/modelName>/', $sysRes['body'], $mm)) {
                        $realData['model'] = $mm[1];
                    }
                }
                // Récupérer l'usage disque
                $diskUrl = 'http://' . $ip . ':' . $port . '/cgi-bin/management/manaRequest.cgi?subfunc=storage_info&sid=' . $sid;
                $diskRes = curlGet($diskUrl, '', '', 4);
                if ($diskRes && $diskRes['code'] === 200) {
                    if (preg_match('/<total_size>(.*?)<\/total_size>/', $diskRes['body'], $tm)) {
                        $realData['total_bytes'] = (float)$tm[1];
                    }
                    if (preg_match('/<used_size>(.*?)<\/used_size>/', $diskRes['body'], $um)) {
                        $realData['used_bytes'] = (float)$um[1];
                    }
                }
            }
        } else {
            // Essai simple ping HTTP sans auth
            $pingRes = curlGet('http://' . $ip . ':' . $port, '', '', 2);
            if ($pingRes !== false && $pingRes['code'] > 0) {
                $online = true;
            }
        }
    }

    // Convertir bytes → To si données réelles disponibles
    if (!empty($realData['total_bytes']) && $realData['total_bytes'] > 0) {
        $capacity = round($realData['total_bytes'] / (1024*1024*1024*1024), 2);
        $used     = round(($realData['used_bytes'] ?? 0) / (1024*1024*1024*1024), 2);
    }

    jsonOk(array(
        'online'   => $online,
        'latency'  => $latency,
        'mode'     => $online ? 'local' : 'offline',
        'address'  => $ip . ':' . $port,
        'model'    => !empty($realData['model']) ? $realData['model'] : $model,
        'capacity' => $capacity,
        'used'     => $used,
        'pct'      => $capacity > 0 ? round(($used / $capacity) * 100) : 0,
    ));
}

// ── ACTION : files (WebDAV) ──
elseif ($action === 'files') {
    $ip          = getNasParam('cortoba_nas_local', '192.168.1.100');
    $webdavPort  = getNasParam('cortoba_nas_webdav_port', '5005');
    $webdavPath  = getNasParam('cortoba_nas_webdav', 'Projets');
    $user        = getNasParam('cortoba_nas_user', 'admin');
    $pass        = getNasParam('cortoba_nas_pass', '');
    $path        = isset($_GET['path']) ? trim($_GET['path'], '/') : $webdavPath;

    if (!$ip || !$webdavPort) {
        jsonError('WebDAV non configuré — renseignez IP, port WebDAV et dossier dans Paramètres', 400);
    }

    $url = 'http://' . $ip . ':' . $webdavPort . '/' . ltrim($path, '/') . '/';
    $files = array();

    // Requête PROPFIND WebDAV
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Depth: 1', 'Content-Type: application/xml'));
        curl_setopt($ch, CURLOPT_POSTFIELDS, '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:getlastmodified/><D:getcontentlength/><D:resourcetype/></D:prop></D:propfind>');
        curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response && ($code === 207 || $code === 200)) {
            // Parser le XML WebDAV
            preg_match_all('/<D:response>(.*?)<\/D:response>/s', $response, $entries);
            foreach ($entries[1] as $entry) {
                // Ignorer le dossier racine lui-même
                if (preg_match('/<D:collection\s*\/>/', $entry)) continue;
                $nom = '';
                $modified = '';
                $size = 0;
                $hrefPath = '';
                if (preg_match('/<D:href>(.*?)<\/D:href>/', $entry, $hm)) $hrefPath = $hm[1];
                if (preg_match('/<D:displayname>(.*?)<\/D:displayname>/', $entry, $nm)) $nom = $nm[1];
                if (!$nom && $hrefPath) $nom = basename(urldecode($hrefPath));
                if (preg_match('/<D:getlastmodified>(.*?)<\/D:getlastmodified>/', $entry, $dm)) {
                    $modified = date('Y-m-d', strtotime($dm[1]));
                }
                if (preg_match('/<D:getcontentlength>(.*?)<\/D:getcontentlength>/', $entry, $sm)) {
                    $size = (int)$sm[1];
                }
                if ($nom && $nom !== basename(rtrim($path, '/'))) {
                    $files[] = array(
                        'nom'      => $nom,
                        'path'     => '/' . ltrim($path, '/') . '/' . $nom,
                        'modified' => $modified,
                        'size'     => $size,
                    );
                }
            }
            // Trier par date modif desc, garder les 20 plus récents
            usort($files, function($a, $b) { return strcmp($b['modified'], $a['modified']); });
            $files = array_slice($files, 0, 20);
        } else {
            jsonError('WebDAV inaccessible (code ' . $code . ') — vérifiez IP, port et identifiants', 503);
        }
    } else {
        jsonError('cURL non disponible sur ce serveur', 500);
    }

    jsonOk($files);
}

// ── ACTION : mkdir (créer un dossier via WebDAV) ──
elseif ($action === 'mkdir') {
    $user = requireAuth();
    $body = getBody();
    $path = isset($body['path']) ? trim($body['path']) : (isset($_GET['path']) ? trim($_GET['path']) : '');
    if (!$path) jsonError('Chemin du dossier requis', 400);

    $rawIp      = getNasParam('cortoba_nas_local', '');
    $ip         = extractIp($rawIp);
    $webdavPort = getNasParam('cortoba_nas_webdav_port', '5005');
    $nasUser    = getNasParam('cortoba_nas_user', 'admin');
    $nasPass    = getNasParam('cortoba_nas_pass', '');
    $rawPublic  = getNasParam('cortoba_nas_public_ip', '');
    $publicIp   = extractIp($rawPublic);

    if (!$webdavPort) jsonError('WebDAV non configuré — renseignez le port dans Paramètres → NAS', 400);

    // Essayer d'abord l'IP publique (serveur hébergé), puis l'IP locale
    $hosts = array();
    if ($publicIp) $hosts[] = $publicIp;
    if ($ip)       $hosts[] = $ip;
    if (empty($hosts)) jsonError('Aucune adresse NAS configurée', 400);

    // Normaliser le chemin : retirer le préfixe UNC Windows et ne garder que le chemin relatif
    // Ex: \\NAS\Projets\2026\01_26_XXX → Projets/2026/01_26_XXX
    $cleanPath = str_replace('\\', '/', $path);
    $cleanPath = preg_replace('#^//[^/]+/#', '', $cleanPath); // Retirer \\NAS\
    $cleanPath = ltrim($cleanPath, '/');

    // Créer chaque niveau du chemin (mkdir -p équivalent)
    $parts = explode('/', $cleanPath);
    $created = array();
    $currentPath = '';
    $lastError = '';
    $success = false;

    foreach ($hosts as $host) {
        $success = true;
        $currentPath = '';
        $created = array();

        foreach ($parts as $part) {
            if (!$part) continue;
            $currentPath .= '/' . $part;
            $url = 'http://' . $host . ':' . $webdavPort . $currentPath . '/';

            if (!function_exists('curl_init')) { jsonError('cURL non disponible', 500); }

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'MKCOL');
            curl_setopt($ch, CURLOPT_USERPWD, $nasUser . ':' . $nasPass);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            // 201 = créé, 405 = existe déjà, 301 = redirigé (existe)
            if ($code === 201) {
                $created[] = $currentPath;
            } elseif ($code === 405 || $code === 301) {
                // Dossier existe déjà — OK
            } elseif ($code === 0) {
                $lastError = 'Connexion impossible à ' . $host . ':' . $webdavPort . ' — ' . $err;
                $success = false;
                break;
            } else {
                $lastError = 'Erreur WebDAV ' . $code . ' pour ' . $currentPath;
                $success = false;
                break;
            }
        }

        if ($success) break; // Réussi avec cet hôte
    }

    if (!$success) {
        jsonError($lastError ?: 'Impossible de créer le dossier NAS', 503);
    }

    jsonOk(array(
        'path'    => $cleanPath,
        'created' => $created,
        'message' => count($created) > 0
            ? count($created) . ' dossier(s) créé(s) sur le NAS'
            : 'Le dossier existe déjà sur le NAS'
    ));
}

// ── ACTION : ping ──
elseif ($action === 'ping') {
    $ip   = getNasParam('cortoba_nas_local', '');
    $port = getNasParam('cortoba_nas_port', '8080');
    if (!$ip) { jsonOk(array('online' => false, 'latency' => 0)); }
    $start = microtime(true);
    $res   = curlGet('http://' . $ip . ':' . $port, '', '', 2);
    $ms    = round((microtime(true) - $start) * 1000);
    jsonOk(array('online' => ($res !== false && $res['code'] > 0), 'latency' => $ms));
}

else {
    jsonError('Action inconnue', 404);
}
