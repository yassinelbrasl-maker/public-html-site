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

// ── Helper : login QNAP File Station (retourne authSid) ──
function qnapLogin($baseUrl, $user, $pass) {
    $loginUrl = $baseUrl . '/cgi-bin/authLogin.cgi?user=' . urlencode($user)
              . '&pwd=' . urlencode(base64_encode($pass));
    $res = curlGet($loginUrl, '', '', 8);
    if (!$res || $res['code'] !== 200) return false;
    if (preg_match('/<authSid><!\[CDATA\[(.*?)\]\]><\/authSid>/', $res['body'], $m)) return $m[1];
    if (preg_match('/<authSid>(.*?)<\/authSid>/', $res['body'], $m)) return $m[1];
    return false;
}

// ── Helper : créer un dossier via QNAP File Station API ──
function qnapCreateFolder($baseUrl, $sid, $destFolder, $folderName) {
    $url = $baseUrl . '/cgi-bin/filemanager/utilRequest.cgi?func=createdir&sid=' . urlencode($sid);
    $postData = 'dest_folder=' . urlencode($destFolder) . '&dest_path=' . urlencode($folderName);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/x-www-form-urlencoded'));
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($code === 0) return array('ok' => false, 'error' => 'Connexion échouée: ' . $err);
    $json = json_decode($response, true);
    if ($json && isset($json['status']) && $json['status'] == 1) return array('ok' => true);
    if ($json && isset($json['status']) && $json['status'] == 2) return array('ok' => true, 'exists' => true);
    if ($code >= 200 && $code < 300) return array('ok' => true);
    $errMsg = ($json && isset($json['status'])) ? 'File Station status=' . $json['status'] : 'HTTP ' . $code;
    return array('ok' => false, 'error' => $errMsg, 'body' => $response);
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
    $cloudHost = getNasParam('cortoba_nas_public_ip', '');

    $online   = false;
    $latency  = 0;
    $realData = array();
    $mode     = 'offline';

    // Construire la liste de baseUrls à essayer
    $tryUrls = array();
    $webdavPort = getNasParam('cortoba_nas_webdav_port', '5005');
    // 1) DDNS/IP publique via port forwarding (ex: port 5005 ext → 8080 int)
    if ($cloudHost && $webdavPort) {
        $h = preg_replace('#^https?://#i', '', trim($cloudHost));
        $h = rtrim($h, '/');
        if ($h && strpos($h, 'qlink.to') === false) {
            $tryUrls[] = array('url' => 'http://' . $h . ':' . $webdavPort, 'mode' => 'cloud-fwd');
        }
    }
    // 2) myQNAPcloud relay (HTTPS port 443)
    if ($cloudHost) {
        $h = preg_replace('#^https?://#i', '', trim($cloudHost));
        $h = rtrim($h, '/');
        if ($h && strpos($h, 'qlink.to') === false) {
            $tryUrls[] = array('url' => 'https://' . $h, 'mode' => 'cloud');
        }
    }
    // 3) IP locale (fonctionne si le serveur est sur le même réseau)
    if ($ip && $port) {
        $tryUrls[] = array('url' => 'http://' . $ip . ':' . $port, 'mode' => 'local');
    }

    foreach ($tryUrls as $t) {
        $baseUrl = $t['url'];
        $start = microtime(true);
        $sid = qnapLogin($baseUrl, $user, $pass);
        $latency = round((microtime(true) - $start) * 1000);

        if ($sid) {
            $online = true;
            $mode = $t['mode'];
            // Récupérer les infos système
            $sysUrl = $baseUrl . '/cgi-bin/management/manaRequest.cgi?subfunc=sysinfo&sid=' . $sid;
            $sysRes = curlGet($sysUrl, '', '', 4);
            if ($sysRes && $sysRes['code'] === 200) {
                if (preg_match('/<modelName>(.*?)<\/modelName>/', $sysRes['body'], $mm)) {
                    $realData['model'] = $mm[1];
                }
            }
            // Récupérer l'usage disque
            $diskUrl = $baseUrl . '/cgi-bin/management/manaRequest.cgi?subfunc=storage_info&sid=' . $sid;
            $diskRes = curlGet($diskUrl, '', '', 4);
            if ($diskRes && $diskRes['code'] === 200) {
                if (preg_match('/<total_size>(.*?)<\/total_size>/', $diskRes['body'], $tm)) {
                    $realData['total_bytes'] = (float)$tm[1];
                }
                if (preg_match('/<used_size>(.*?)<\/used_size>/', $diskRes['body'], $um)) {
                    $realData['used_bytes'] = (float)$um[1];
                }
            }
            break; // Un hôte accessible trouvé
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
        'mode'     => $mode,
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

// ── ACTION : mkdir (créer un dossier via QNAP File Station API) ──
elseif ($action === 'mkdir') {
    $user = requireAuth();
    $body = getBody();
    $path = isset($body['path']) ? trim($body['path']) : (isset($_GET['path']) ? trim($_GET['path']) : '');
    if (!$path) jsonError('Chemin du dossier requis', 400);

    $rawIp      = getNasParam('cortoba_nas_local', '');
    $ip         = extractIp($rawIp);
    $port       = getNasParam('cortoba_nas_port', '8080');
    $webdavPort = getNasParam('cortoba_nas_webdav_port', '5005');
    $nasUser    = getNasParam('cortoba_nas_user', 'admin');
    $nasPass    = getNasParam('cortoba_nas_pass', '');
    $cloudHost  = getNasParam('cortoba_nas_public_ip', '');

    // Normaliser le chemin UNC → chemin absolu NAS
    // Ex: \\192.168.1.165\Public\CAS_PROJETS\2026\01_26_XXX → /Public/CAS_PROJETS/2026/01_26_XXX
    $cleanPath = str_replace('\\', '/', $path);
    $cleanPath = preg_replace('#^//[^/]+/#', '/', $cleanPath); // \\IP\Public\... → /Public/...
    $cleanPath = preg_replace('#^/+#', '/', $cleanPath);       // ensure single leading /
    if (substr($cleanPath, 0, 1) !== '/') $cleanPath = '/' . $cleanPath;

    // Séparer en dossier parent + nom du dossier à créer
    // Ex: /Public/CAS_PROJETS/2026/01_26_XXX
    //   → On crée d'abord /Public/CAS_PROJETS/2026 puis 01_26_XXX dedans
    $pathParts = explode('/', trim($cleanPath, '/'));
    if (count($pathParts) < 2) jsonError('Chemin trop court: ' . $cleanPath, 400);

    // Construire les URLs de base à essayer
    $baseUrls = array();
    // 1) DDNS/IP publique via port forwarding (ex: ext 5005 → int 8080)
    if ($cloudHost && $webdavPort) {
        $h = preg_replace('#^https?://#i', '', trim($cloudHost));
        $h = rtrim($h, '/');
        if ($h && strpos($h, 'qlink.to') === false) {
            $baseUrls[] = 'http://' . $h . ':' . $webdavPort;
        }
    }
    // 2) myQNAPcloud relay (HTTPS port 443)
    if ($cloudHost) {
        $h = preg_replace('#^https?://#i', '', trim($cloudHost));
        $h = rtrim($h, '/');
        if ($h && strpos($h, 'qlink.to') === false) {
            $baseUrls[] = 'https://' . $h;
        }
    }
    // 3) IP locale (fonctionne si le serveur est sur le même réseau)
    if ($ip && $port) {
        $baseUrls[] = 'http://' . $ip . ':' . $port;
    }

    if (empty($baseUrls)) jsonError('Aucune adresse NAS configurée (renseignez cortoba_nas_public_ip)', 400);

    $lastError = '';
    $success = false;
    $created = array();
    $method = '';

    // ── Méthode 1 : QNAP File Station API (fonctionne via myqnapcloud relay HTTPS) ──
    foreach ($baseUrls as $baseUrl) {
        $sid = qnapLogin($baseUrl, $nasUser, $nasPass);
        if (!$sid) {
            $lastError = 'Login QNAP échoué sur ' . $baseUrl;
            continue;
        }

        // Créer chaque niveau nécessaire via File Station (mkdir -p)
        // Ex: /Public/CAS_PROJETS/2026/01_26_Nom
        //   → createdir(/Public, CAS_PROJETS)         — existera déjà
        //   → createdir(/Public/CAS_PROJETS, 2026)    — peut ne pas exister
        //   → createdir(/Public/CAS_PROJETS/2026, 01_26_Nom)  — à créer
        $success = true;
        for ($i = 0; $i < count($pathParts); $i++) {
            $parentPath = ($i === 0) ? '/' : '/' . implode('/', array_slice($pathParts, 0, $i));
            $childName = $pathParts[$i];
            $res = qnapCreateFolder($baseUrl, $sid, $parentPath, $childName);
            if ($res['ok']) {
                if (empty($res['exists'])) $created[] = $parentPath . '/' . $childName;
            } else {
                $lastError = 'Erreur File Station: ' . ($res['error'] ?: 'inconnu') . ' pour ' . $parentPath . '/' . $childName;
                $success = false;
                break;
            }
        }

        if ($success) {
            $method = $baseUrl;
            break;
        }
    }

    // ── Méthode 2 (fallback) : WebDAV MKCOL ──
    if (!$success && $webdavPort) {
        $webdavHosts = array();
        if ($ip) $webdavHosts[] = $ip;
        // Essayer myqnapcloud aussi en WebDAV si possible
        if ($cloudHost) {
            $h = preg_replace('#^https?://#i', '', trim($cloudHost));
            $h = rtrim($h, '/');
            if ($h && strpos($h, 'qlink.to') === false) $webdavHosts[] = $h;
        }

        foreach ($webdavHosts as $host) {
            $success = true;
            $currentPath = '';
            $created = array();

            foreach ($pathParts as $part) {
                if (!$part) continue;
                $currentPath .= '/' . $part;
                $url = 'http://' . $host . ':' . $webdavPort . $currentPath . '/';

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

                if ($code === 201) {
                    $created[] = $currentPath;
                } elseif ($code === 405 || $code === 301) {
                    // Dossier existe déjà — OK
                } else {
                    $lastError = ($code === 0)
                        ? 'WebDAV: connexion impossible à ' . $host . ':' . $webdavPort . ' — ' . $err
                        : 'WebDAV: erreur ' . $code . ' pour ' . $currentPath;
                    $success = false;
                    break;
                }
            }

            if ($success) { $method = 'webdav://' . $host . ':' . $webdavPort; break; }
        }
    }

    if (!$success) {
        jsonError($lastError ?: 'Impossible de créer le dossier NAS', 503);
    }

    jsonOk(array(
        'path'    => $cleanPath,
        'created' => $created,
        'method'  => $method,
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

// ── ACTION : test_webdav ──
elseif ($action === 'test_webdav') {
    $body = getBody();
    $hosts = isset($body['hosts']) ? $body['hosts'] : array();
    $port  = isset($body['port'])  ? intval($body['port']) : 5005;
    $user  = getNasParam('cortoba_nas_user', '');
    $pass  = getNasParam('cortoba_nas_pass', '');
    $results = array();
    foreach ($hosts as $host) {
        if (!$host) continue;
        $url = 'http://' . $host . ':' . $port . '/';
        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Depth: 0'));
        if ($user) curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $ms = round((microtime(true) - $start) * 1000);
        $results[] = array(
            'host' => $host, 'port' => $port,
            'reachable' => ($code > 0 && $code < 500),
            'code' => $code, 'latency' => $ms,
            'error' => $err ?: null
        );
    }
    jsonOk($results);
}

// ── ACTION : diag (diagnostic complet de connexion NAS) ──
elseif ($action === 'diag') {
    $ip         = getNasParam('cortoba_nas_local', '');
    $port       = getNasParam('cortoba_nas_port', '8080');
    $webdavPort = getNasParam('cortoba_nas_webdav_port', '5005');
    $nasUser    = getNasParam('cortoba_nas_user', '');
    $nasPass    = getNasParam('cortoba_nas_pass', '');
    $cloudHost  = getNasParam('cortoba_nas_public_ip', '');

    $results = array();

    // Nettoyer le cloudHost
    $h = '';
    if ($cloudHost) {
        $h = preg_replace('#^https?://#i', '', trim($cloudHost));
        $h = rtrim($h, '/');
        if (strpos($h, 'qlink.to') !== false) $h = '';
    }

    // Résolution DNS du cloudHost
    if ($h) {
        $dnsIp = gethostbyname($h);
        $results['dns'] = array('host' => $h, 'resolved_ip' => $dnsIp, 'ok' => ($dnsIp !== $h));
    }

    // Test 1: DDNS:webdavPort (port forwarding → QTS)
    if ($h && $webdavPort) {
        $url = 'http://' . $h . ':' . $webdavPort;
        $start = microtime(true);
        $sid = qnapLogin($url, $nasUser, $nasPass);
        $ms = round((microtime(true) - $start) * 1000);
        $results['ddns_fwd'] = array(
            'url' => $url, 'latency' => $ms,
            'login_ok' => ($sid !== false),
            'sid_preview' => $sid ? substr($sid, 0, 8) . '...' : null
        );
    }

    // Test 2: DDNS:port (direct QTS port, si forwarded)
    if ($h && $port && $port !== $webdavPort) {
        $url = 'http://' . $h . ':' . $port;
        $start = microtime(true);
        $sid = qnapLogin($url, $nasUser, $nasPass);
        $ms = round((microtime(true) - $start) * 1000);
        $results['ddns_direct'] = array(
            'url' => $url, 'latency' => $ms,
            'login_ok' => ($sid !== false)
        );
    }

    // Test 3: HTTPS relay myqnapcloud
    if ($h) {
        $url = 'https://' . $h;
        $start = microtime(true);
        $sid = qnapLogin($url, $nasUser, $nasPass);
        $ms = round((microtime(true) - $start) * 1000);
        $results['cloud_relay'] = array(
            'url' => $url, 'latency' => $ms,
            'login_ok' => ($sid !== false)
        );
    }

    // Test 4: IP locale
    if ($ip && $port) {
        $url = 'http://' . $ip . ':' . $port;
        $start = microtime(true);
        $sid = qnapLogin($url, $nasUser, $nasPass);
        $ms = round((microtime(true) - $start) * 1000);
        $results['local'] = array(
            'url' => $url, 'latency' => $ms,
            'login_ok' => ($sid !== false)
        );
    }

    // Test 5: IP publique résolue directement
    if ($h) {
        $dnsIp = gethostbyname($h);
        if ($dnsIp !== $h && $dnsIp !== $ip && $webdavPort) {
            $url = 'http://' . $dnsIp . ':' . $webdavPort;
            $start = microtime(true);
            $sid = qnapLogin($url, $nasUser, $nasPass);
            $ms = round((microtime(true) - $start) * 1000);
            $results['public_ip_fwd'] = array(
                'url' => $url, 'latency' => $ms,
                'login_ok' => ($sid !== false)
            );
        }
    }

    $results['settings'] = array(
        'local_ip' => $ip, 'port' => $port,
        'webdav_port' => $webdavPort,
        'cloud_host' => $h,
        'user' => $nasUser ? '***' : '(vide)'
    );

    jsonOk($results);
}

else {
    jsonError('Action inconnue', 404);
}
