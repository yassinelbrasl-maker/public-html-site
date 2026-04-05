<?php
// ============================================================
//  CORTOBA ATELIER — API Projets
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/chat_helpers.php';

// ── Migrations idempotentes pour colonnes Rendement ──
function ensureProjetsRendementColumns() {
    $db = getDB();
    $extra = array(
        "contract_value DECIMAL(14,3) DEFAULT NULL",
        "project_type   VARCHAR(80)   DEFAULT NULL",
        "budget_heures  DECIMAL(8,2)  DEFAULT NULL",
    );
    foreach ($extra as $def) {
        try { $db->exec("ALTER TABLE CA_projets ADD COLUMN IF NOT EXISTS $def"); }
        catch (\Throwable $e) { /* déjà présent ou MySQL ancien */ }
    }
}
try { ensureProjetsRendementColumns(); } catch (\Throwable $e) {}

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

try {
    if ($method === 'GET')        $id ? getOne($id) : getAll();
    elseif ($method === 'POST')   create($user);
    elseif ($method === 'PUT')    update($id, $user);
    elseif ($method === 'DELETE') remove($id, $user);
    else jsonError('Méthode non supportée', 405);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

function getAll() {
    $db = getDB();
    $where = ['1=1'];
    $params = [];
    if (!empty($_GET['statut']))  { $where[] = 'p.statut = ?';   $params[] = $_GET['statut']; }
    if (!empty($_GET['phase']))   { $where[] = 'p.phase = ?';    $params[] = $_GET['phase']; }
    if (!empty($_GET['annee']))   { $where[] = 'p.annee = ?';    $params[] = $_GET['annee']; }
    if (!empty($_GET['q'])) {
        $q = '%' . $_GET['q'] . '%';
        $where[] = '(p.nom LIKE ? OR p.client LIKE ? OR p.code LIKE ? OR p.adresse LIKE ?)';
        array_push($params, $q, $q, $q, $q);
    }
    $sql  = 'SELECT p.* FROM CA_projets p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.cree_at DESC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $projets = $stmt->fetchAll();
    foreach ($projets as &$p) {
        $p['missions']     = getMissions($p['id']);
        $p['intervenants'] = getIntervenants($p['id']);
    }
    jsonOk($projets);
}

function getOne(string $id) {
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM CA_projets WHERE id = ?');
    $stmt->execute([$id]);
    $p = $stmt->fetch();
    if (!$p) jsonError('Projet introuvable', 404);
    $p['missions']     = getMissions($id);
    $p['intervenants'] = getIntervenants($id);
    jsonOk($p);
}

function create(array $user) {
    $body = getBody();
    $nom  = trim($body['nom'] ?? '');
    if (!$nom) jsonError('Nom du projet requis');

    $db = getDB();
    $id = bin2hex(random_bytes(16));

    $code  = $body['code'] ?? '';
    $annee = $body['annee'] ?? date('Y');

    // Si le code existe déjà, recalculer le prochain numéro séquentiel
    $yy = substr($annee, -2);
    $maxRetries = 10;
    for ($attempt = 0; $attempt < $maxRetries; $attempt++) {
        try {
            $db->prepare('
                INSERT INTO CA_projets (id, code, nom, client, client_code, annee, phase, statut, type_bat,
                    delai, honoraires, budget, surface, description, adresse, lat, lng, nas_path,
                    surface_shon, surface_shob, surface_terrain, standing, zone, cout_construction, cout_m2,
                    cree_par)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ')->execute([
                $id,
                $code,
                $nom,
                $body['client']      ?? '',
                $body['clientCode']  ?? '',
                $annee,
                $body['phase']       ?? 'APS',
                $body['statut']      ?? 'Actif',
                $body['typeBat']     ?? null,
                $body['delai']       ?: null,
                floatval($body['honoraires'] ?? 0),
                floatval($body['budget']     ?? 0),
                floatval($body['surface']    ?? 0),
                $body['description'] ?? null,
                $body['adresse']     ?? null,
                !empty($body['lat']) ? floatval($body['lat']) : null,
                !empty($body['lng']) ? floatval($body['lng']) : null,
                $body['nasPath']     ?? null,
                !empty($body['surface_shon']) ? floatval($body['surface_shon']) : null,
                !empty($body['surface_shob']) ? floatval($body['surface_shob']) : null,
                !empty($body['surface_terrain']) ? floatval($body['surface_terrain']) : null,
                $body['standing']    ?? null,
                $body['zone']        ?? null,
                !empty($body['cout_construction']) ? floatval($body['cout_construction']) : null,
                !empty($body['cout_m2']) ? floatval($body['cout_m2']) : null,
                $user['name'],
            ]);
            break; // INSERT réussi
        } catch (\PDOException $e) {
            if ($e->getCode() == 23000 && strpos($e->getMessage(), 'Duplicate') !== false) {
                // Code dupliqué → recalculer le prochain numéro
                $stmt = $db->prepare("SELECT MAX(CAST(SUBSTRING_INDEX(code, '_', 1) AS UNSIGNED)) AS mx FROM CA_projets WHERE code LIKE ?");
                $stmt->execute(['%_' . $yy . '_%']);
                $row  = $stmt->fetch(\PDO::FETCH_ASSOC);
                $next = ($row && $row['mx']) ? intval($row['mx']) + 1 : $attempt + 2;
                $parts = explode('_', $code);
                $parts[0] = str_pad($next, 2, '0', STR_PAD_LEFT);
                $code = implode('_', $parts);
                $id = bin2hex(random_bytes(16)); // nouvel ID
            } else {
                throw $e; // autre erreur → remonter
            }
        }
    }

    // Si le code a été recalculé, mettre à jour le nas_path en DB
    if ($code !== ($body['code'] ?? '')) {
        $nasPath = $body['nasPath'] ?? '';
        if ($nasPath) {
            $nasPath = preg_replace('/[^\\\\\/]+$/', '', $nasPath);
            // Reconstruire le nom du dossier avec le nouveau code
            $clientNom = $body['client'] ?? '';
            $suffix = preg_replace('/\s+/', '_', trim($clientNom));
            $suffix = preg_replace('/[^\w\-.]/', '', $suffix);
            $nasPath .= $code . ($suffix ? '_' . $suffix : '');
            $db->prepare('UPDATE CA_projets SET code = ?, nas_path = ? WHERE id = ?')->execute([$code, $nasPath, $id]);
        } else {
            $db->prepare('UPDATE CA_projets SET code = ? WHERE id = ?')->execute([$code, $id]);
        }
    }

    saveMissions($id, $body['missions'] ?? []);
    saveIntervenants($id, $body['intervenants'] ?? []);

    if (!empty($body['clientCode'])) {
        $db->prepare('UPDATE CA_clients SET projets = projets + 1 WHERE code = ?')->execute([$body['clientCode']]);
    }

    // Créer le dossier sur le NAS via WebDAV
    $nasResult = null;
    if ($code) {
        $nasPath = $body['nasPath'] ?? '';
        $nasFolderName = '';
        if ($nasPath) {
            $parts = preg_split('/[\\\\\/]/', rtrim($nasPath, '\\/'));
            $nasFolderName = end($parts);
        }
        $nasResult = createProjectNasFolder($code, $annee, '', $nasFolderName);
    }

    // Retourner le projet créé + résultat NAS
    $stmt = $db->prepare('SELECT * FROM CA_projets WHERE id = ?');
    $stmt->execute([$id]);
    $projet = $stmt->fetch(PDO::FETCH_ASSOC);
    $result = $projet ?: array('id' => $id);
    if ($nasResult !== null) {
        $result['nas_debug'] = $nasResult;
    }

    // ── Création optionnelle du groupe de discussion (Lot 2) ──
    if (!empty($body['create_chat_room']) && $projet) {
        try {
            $roomId = chat_create_project_room($db, $projet, $user['name'] ?? null);
            $result['chat_room_id'] = $roomId;
        } catch (\Throwable $e) {
            $result['chat_room_error'] = $e->getMessage();
        }
    }

    jsonOk($result);
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CA_projets WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Projet introuvable', 404);

    $db->prepare('
        UPDATE CA_projets SET
            nom=?, client=?, client_code=?, annee=?, phase=?, statut=?, type_bat=?,
            delai=?, honoraires=?, budget=?, surface=?, description=?, adresse=?,
            lat=?, lng=?,
            surface_shon=?, surface_shob=?, surface_terrain=?, standing=?, zone=?,
            cout_construction=?, cout_m2=?,
            modifie_par=?
        WHERE id=?
    ')->execute([
        trim($body['nom']        ?? ''),
        $body['client']          ?? '',
        $body['clientCode']      ?? '',
        $body['annee']           ?? date('Y'),
        $body['phase']           ?? 'APS',
        $body['statut']          ?? 'Actif',
        $body['typeBat']         ?? null,
        $body['delai']           ?: null,
        floatval($body['honoraires'] ?? 0),
        floatval($body['budget']     ?? 0),
        floatval($body['surface']    ?? 0),
        $body['description']     ?? null,
        $body['adresse']         ?? null,
        !empty($body['lat']) ? floatval($body['lat']) : null,
        !empty($body['lng']) ? floatval($body['lng']) : null,
        !empty($body['surface_shon']) ? floatval($body['surface_shon']) : null,
        !empty($body['surface_shob']) ? floatval($body['surface_shob']) : null,
        !empty($body['surface_terrain']) ? floatval($body['surface_terrain']) : null,
        $body['standing']        ?? null,
        $body['zone']            ?? null,
        !empty($body['cout_construction']) ? floatval($body['cout_construction']) : null,
        !empty($body['cout_m2']) ? floatval($body['cout_m2']) : null,
        $user['name'],
        $id,
    ]);

    saveMissions($id, $body['missions'] ?? []);
    saveIntervenants($id, $body['intervenants'] ?? []);

    // Création différée du groupe de discussion si coché en édition
    if (!empty($body['create_chat_room'])) {
        try {
            $st = $db->prepare('SELECT * FROM CA_projets WHERE id = ?');
            $st->execute([$id]);
            $proj = $st->fetch(PDO::FETCH_ASSOC);
            if ($proj) chat_create_project_room($db, $proj, $user['name'] ?? null);
        } catch (\Throwable $e) { /* silencieux */ }
    }

    getOne($id);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') jsonError('Seul un Architecte gérant peut supprimer', 403);
    $db = getDB();
    $db->prepare('DELETE FROM CA_projets_missions WHERE projet_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM CA_projets_intervenants WHERE projet_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM CA_projets WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}

function getMissions(string $projetId) {
    $stmt = getDB()->prepare('SELECT mission FROM CA_projets_missions WHERE projet_id = ? ORDER BY id');
    $stmt->execute([$projetId]);
    return array_column($stmt->fetchAll(), 'mission');
}

function getIntervenants(string $projetId) {
    $stmt = getDB()->prepare('SELECT role, nom, contact FROM CA_projets_intervenants WHERE projet_id = ? ORDER BY id');
    $stmt->execute([$projetId]);
    return $stmt->fetchAll();
}

// ── Lire un paramètre NAS depuis CA_settings puis CA_parametres (fallback) ──
function getNasCfg($key, $default = '') {
    $db = getDB();
    // 1) Chercher dans CA_settings
    try {
        $stmt = $db->prepare('SELECT setting_value FROM CA_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute(array($key));
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $decoded = json_decode($row['setting_value'], true);
            return ($decoded !== null) ? $decoded : $row['setting_value'];
        }
    } catch (Exception $e) {}
    // 2) Fallback CA_parametres
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

// ── Créer un dossier via WebDAV MKCOL ──
function webdavMkcol($url, $user, $pass) {
    if (!function_exists('curl_init')) return array('code' => 0, 'error' => 'curl not available');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'MKCOL');
    curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return array('code' => $httpCode, 'error' => $error, 'url' => $url);
}

// ── Lister les sous-dossiers via WebDAV PROPFIND ──
function webdavListFolders($url, $user, $pass) {
    if (!function_exists('curl_init')) return array();
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Depth: 1', 'Content-Type: application/xml'));
    curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code != 207 || !$body) return array();

    $folders = array();
    // Extraire les href depuis la réponse XML (compatible tous formats namespace)
    if (preg_match_all('/<(?:D:|d:)?href>([^<]+)<\/(?:D:|d:)?href>/i', $body, $matches)) {
        $parentPath = rtrim(parse_url($url, PHP_URL_PATH), '/');
        for ($i = 0; $i < count($matches[1]); $i++) {
            $href = rtrim($matches[1][$i], '/');
            if ($href === $parentPath) continue; // Ignorer le dossier parent lui-même
            $parts = explode('/', $href);
            $name = rawurldecode(end($parts));
            if ($name && $name !== '.' && $name !== '..') {
                $folders[] = $name;
            }
        }
    }
    return $folders;
}

// ── Copier un dossier/fichier via WebDAV COPY ──
function webdavCopy($srcUrl, $destUrl, $user, $pass) {
    if (!function_exists('curl_init')) return 0;
    $ch = curl_init($srcUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'COPY');
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Destination: ' . $destUrl,
        'Depth: infinity',
        'Overwrite: F'
    ));
    curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $httpCode; // 201=copié, 204=écrasé
}

// ── Créer le dossier projet sur le NAS via WebDAV ──
function createProjectNasFolder($code, $annee, $clientNom, $nasFolderName = '') {
    $debug = array('status' => 'started');
    try {
        $local      = getNasCfg('cortoba_nas_local', '');
        $publicIp   = getNasCfg('cortoba_nas_public_ip', '');
        $webdavPort = getNasCfg('cortoba_nas_webdav_port', '5005');
        $webdavBase = getNasCfg('cortoba_nas_webdav', '');
        $user       = getNasCfg('cortoba_nas_user', 'admin');
        $pass       = getNasCfg('cortoba_nas_pass', '');

        $debug['config'] = array(
            'local' => $local, 'publicIp' => $publicIp,
            'webdavPort' => $webdavPort, 'webdavBase' => $webdavBase,
            'user' => $user, 'hasPass' => !empty($pass)
        );

        // Extraire le chemin WebDAV depuis le UNC si non configuré
        if (!$webdavBase && $local && preg_match('/^[\\\\\/]{2}[^\\\\\/]+[\\\\\/](.+)$/', $local, $mx)) {
            $webdavBase = str_replace('\\', '/', trim($mx[1], '\\/'));
        }

        // IP publique en priorité, sinon IP locale
        if ($publicIp) {
            $ip = trim($publicIp);
        } elseif ($local) {
            if (preg_match('/^[\\\\\/]{2}([^\\\\\/]+)/', $local, $m)) {
                $ip = $m[1];
            } else {
                $ip = trim($local);
            }
        } else {
            $debug['status'] = 'no_ip';
            return $debug;
        }

        if (!$ip || !$webdavPort) { $debug['status'] = 'missing_config'; return $debug; }

        if ($nasFolderName) {
            $folderName = $nasFolderName;
        } else {
            $suffix = preg_replace('/\s+/', '_', trim($clientNom));
            $suffix = preg_replace('/[^\w\-.]/', '', $suffix);
            $folderName = $code . ($suffix ? '_' . $suffix : '');
        }

        $base = rtrim('http://' . $ip . ':' . $webdavPort . ($webdavBase ? '/' . ltrim(str_replace('\\', '/', $webdavBase), '/') : ''), '/');

        $yearUrl    = $base . '/' . $annee . '/';
        $projectUrl = $yearUrl . rawurlencode($folderName) . '/';

        $debug['ip'] = $ip;
        $debug['base'] = $base;
        $debug['yearUrl'] = $yearUrl;
        $debug['projectUrl'] = $projectUrl;
        $debug['folderName'] = $folderName;

        // 1. Créer le dossier année
        $r1 = webdavMkcol($yearUrl, $user, $pass);
        $debug['year_mkcol'] = $r1;

        // 2. Créer le dossier projet
        $r2 = webdavMkcol($projectUrl, $user, $pass);
        $debug['project_mkcol'] = $r2;

        // 3. Copier les sous-dossiers template si le dossier a été créé
        if ($r2['code'] == 201) {
            $templateUrl = $yearUrl . rawurlencode('00-Dossier Type') . '/';
            $subfolders  = webdavListFolders($templateUrl, $user, $pass);
            $debug['template_folders'] = $subfolders;
            foreach ($subfolders as $sub) {
                $src  = $templateUrl . rawurlencode($sub) . '/';
                $dest = $projectUrl . rawurlencode($sub) . '/';
                webdavCopy($src, $dest, $user, $pass);
            }
        }

        $debug['status'] = ($r2['code'] == 201 || $r2['code'] == 405) ? 'ok' : 'failed';
    } catch (\Throwable $e) {
        $debug['status'] = 'error';
        $debug['exception'] = $e->getMessage();
    }
    return $debug;
}

function saveMissions(string $projetId, array $missions) {
    $db = getDB();
    $db->prepare('DELETE FROM CA_projets_missions WHERE projet_id = ?')->execute([$projetId]);
    $stmt = $db->prepare('INSERT INTO CA_projets_missions (projet_id, mission) VALUES (?,?)');
    foreach ($missions as $m) {
        if (trim($m ?? '')) $stmt->execute([$projetId, trim($m)]);
    }
}

function saveIntervenants(string $projetId, array $intervenants) {
    $db = getDB();
    $db->prepare('DELETE FROM CA_projets_intervenants WHERE projet_id = ?')->execute([$projetId]);
    $stmt = $db->prepare('INSERT INTO CA_projets_intervenants (projet_id, role, nom, contact) VALUES (?,?,?,?)');
    foreach ($intervenants as $i) {
        if (!empty($i['nom'])) {
            $stmt->execute([$projetId, $i['role'] ?? '', $i['nom'], $i['contact'] ?? '']);
        }
    }
}
