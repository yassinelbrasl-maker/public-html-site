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
        "nas_path       VARCHAR(500)  DEFAULT NULL",
    );
    foreach ($extra as $def) {
        try { $db->exec("ALTER TABLE CA_projets ADD COLUMN IF NOT EXISTS $def"); }
        catch (\Throwable $e) { /* déjà présent ou MySQL ancien */ }
    }
}
try { ensureProjetsRendementColumns(); } catch (\Throwable $e) {}

// Migration : colonnes modifie_par, cree_par, cree_at
try {
    $db = getDB();
    $cols = array_column($db->query("SHOW COLUMNS FROM CA_projets")->fetchAll(), 'Field');
    if (!in_array('modifie_par', $cols)) {
        $db->exec("ALTER TABLE CA_projets ADD COLUMN modifie_par VARCHAR(120) DEFAULT NULL");
    }
    if (!in_array('cree_par', $cols)) {
        $db->exec("ALTER TABLE CA_projets ADD COLUMN cree_par VARCHAR(120) DEFAULT NULL");
    }
    if (!in_array('cree_at', $cols)) {
        $db->exec("ALTER TABLE CA_projets ADD COLUMN cree_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
} catch (\Throwable $e) {}

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
                    delai, honoraires, budget, surface, description, adresse, lat, lng,
                    surface_shon, surface_shob, surface_terrain, standing, zone, cout_construction, cout_m2,
                    cree_par)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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

    // Si le code a été recalculé, mettre à jour en DB
    if ($code !== ($body['code'] ?? '')) {
        $db->prepare('UPDATE CA_projets SET code = ? WHERE id = ?')->execute([$code, $id]);
    }

    saveMissions($id, $body['missions'] ?? []);
    saveIntervenants($id, $body['intervenants'] ?? []);

    if (!empty($body['clientCode'])) {
        $db->prepare('UPDATE CA_clients SET projets = projets + 1 WHERE code = ?')->execute([$body['clientCode']]);
    }

    // Retourner le projet créé
    $stmt = $db->prepare('SELECT * FROM CA_projets WHERE id = ?');
    $stmt->execute([$id]);
    $projet = $stmt->fetch(PDO::FETCH_ASSOC);
    $result = $projet ?: array('id' => $id);

    // ── Création optionnelle du groupe de discussion (Lot 2) ──
    if (!empty($body['create_chat_room']) && $projet) {
        try {
            $roomId = chat_create_project_room($db, $projet, $user['name'] ?? null, $user['id'] ?? null);
            $result['chat_room_id'] = $roomId;
        } catch (\Throwable $e) {
            $result['chat_room_error'] = $e->getMessage();
        }
    }

    // NB : La création du dossier NAS se fait côté navigateur (WebDAV)
    // car le serveur distant ne peut pas atteindre le NAS local.

    jsonOk($result);
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CA_projets WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Projet introuvable', 404);

    // Mise à jour partielle : NAS path uniquement
    if (isset($body['nasPath']) && !isset($body['nom'])) {
        $db->prepare('UPDATE CA_projets SET nas_path=?, modifie_par=? WHERE id=?')
           ->execute([$body['nasPath'], $user['name'], $id]);
        jsonOk(['updated' => $id, 'nas_path' => $body['nasPath']]);
        return;
    }

    $db->prepare('
        UPDATE CA_projets SET
            code=?, nom=?, client=?, client_code=?, annee=?, phase=?, statut=?, type_bat=?,
            delai=?, honoraires=?, budget=?, surface=?, description=?, adresse=?,
            lat=?, lng=?,
            surface_shon=?, surface_shob=?, surface_terrain=?, standing=?, zone=?,
            cout_construction=?, cout_m2=?,
            nas_path=?,
            modifie_par=?
        WHERE id=?
    ')->execute([
        $body['code']            ?? '',
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
        $body['nasPath']         ?? null,
        $user['name'],
        $id,
    ]);

    saveMissions($id, $body['missions'] ?? []);
    saveIntervenants($id, $body['intervenants'] ?? []);

    // Hook chat : archive/réactivation selon statut
    try {
        chat_hook_project_status($id, $body['statut'] ?? '');
    } catch (\Throwable $e) { /* silencieux */ }

    // Création différée du groupe de discussion si coché en édition
    if (!empty($body['create_chat_room'])) {
        try {
            $st = $db->prepare('SELECT * FROM CA_projets WHERE id = ?');
            $st->execute([$id]);
            $proj = $st->fetch(PDO::FETCH_ASSOC);
            if ($proj) chat_create_project_room($db, $proj, $user['name'] ?? null, $user['id'] ?? null);
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

function saveMissions(string $projetId, array $missions) {
    $db = getDB();
    $db->prepare('DELETE FROM CA_projets_missions WHERE projet_id = ?')->execute([$projetId]);
    $stmt = $db->prepare('INSERT INTO CA_projets_missions (projet_id, mission) VALUES (?,?)');
    foreach ($missions as $m) {
        if (trim($m ?? '')) $stmt->execute([$projetId, trim($m)]);
    }
}

// ── Créer un dossier projet sur le NAS via WebDAV ──
function createNasProjectFolder(PDO $db, array $projet): array {
    // Lire la config NAS depuis CA_settings
    $stmt = $db->prepare("SELECT setting_key, setting_value FROM CA_settings WHERE setting_key IN (
        'cortoba_nas_local','cortoba_nas_user','cortoba_nas_pass',
        'cortoba_nas_webdav_port','cortoba_nas_projets_root','cortoba_nas_template_folder'
    )");
    $stmt->execute();
    $cfg = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $cfg[$row['setting_key']] = $row['setting_value'];
    }

    // Extraire l'IP du chemin UNC (\\192.168.1.165\Public\...)
    $uncPath = $cfg['cortoba_nas_local'] ?? '';
    $ip = '';
    if (preg_match('/\\\\\\\\([^\\\\]+)/', $uncPath, $m)) {
        $ip = $m[1];
    }
    if (!$ip) throw new \RuntimeException('IP du NAS non configurée');

    $port      = $cfg['cortoba_nas_webdav_port'] ?? '5005';
    $user      = $cfg['cortoba_nas_user'] ?? '';
    $pass      = $cfg['cortoba_nas_pass'] ?? '';
    $rootPath  = rtrim($cfg['cortoba_nas_projets_root'] ?? '/Public/CAS_PROJETS', '/');
    $annee     = $projet['annee'] ?? date('Y');
    $code      = $projet['code'] ?? '';
    $client    = $projet['client'] ?? $projet['nom'] ?? '';

    // Nom du dossier : CODE_NomClient (nettoyé)
    $folderName = trim($code . '_' . $client);
    $folderName = preg_replace('/[<>:"\/|?*]/', '_', $folderName); // caractères interdits

    $baseUrl = 'http://' . $ip . ':' . $port;

    // Créer le dossier année si nécessaire, puis le dossier projet
    $paths = [
        $rootPath . '/' . $annee,
        $rootPath . '/' . $annee . '/' . $folderName,
    ];

    $results = [];
    foreach ($paths as $path) {
        $url = $baseUrl . '/' . rawurlencode_path($path);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => 'MKCOL',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/xml'],
        ]);
        if ($user) {
            curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
            curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        }
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        $results[] = [
            'path'     => $path,
            'http'     => $httpCode,
            'ok'       => ($httpCode === 201 || $httpCode === 405), // 405 = déjà existant
            'error'    => $error ?: null,
        ];
    }

    $folderPath = $rootPath . '/' . $annee . '/' . $folderName;
    $allOk = true;
    foreach ($results as $r) {
        if (!$r['ok'] && $r['error']) { $allOk = false; break; }
    }

    return [
        'created' => $allOk,
        'path'    => $folderPath,
        'details' => $results,
    ];
}

// Encode chaque segment du chemin WebDAV individuellement
function rawurlencode_path(string $path): string {
    return implode('/', array_map('rawurlencode', explode('/', $path)));
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
