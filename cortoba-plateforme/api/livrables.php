<?php
// ============================================================
//  CORTOBA ATELIER — API Livrables
//  - Catalogue (stocké dans CA_settings via cortoba_livrables_catalogue)
//  - Instances par tâche : table CA_tache_livrables (auto-créée)
//
//  Endpoints (tous protégés par requireAuth) :
//    GET    ?tache_id=XX                  → liste des livrables d'une tâche
//    POST   body: {tache_id,label}        → ajouter un livrable à une tâche
//    POST   body: {tache_id,action:"apply_catalogue"}
//                                         → préremplir depuis le catalogue
//    PUT    ?id=XX body: {done?,label?,ordre?} → modifier
//    DELETE ?id=XX                        → supprimer un item
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/notification_dispatch.php';
require_once __DIR__ . '/corbeille.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

// ── Auto-création de la table (idempotent) ──────────────────
try {
    $db0 = getDB();
    $db0->exec("
        CREATE TABLE IF NOT EXISTS CA_tache_livrables (
            id            VARCHAR(32)  NOT NULL PRIMARY KEY,
            tache_id      VARCHAR(32)  NOT NULL,
            label         VARCHAR(300) NOT NULL,
            done          TINYINT(1)   NOT NULL DEFAULT 0,
            catalogue_id  VARCHAR(40)  DEFAULT NULL,
            ordre         INT          NOT NULL DEFAULT 0,
            done_par      VARCHAR(120) DEFAULT NULL,
            done_at       DATETIME     DEFAULT NULL,
            cree_par      VARCHAR(120) DEFAULT NULL,
            cree_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            modifie_at    DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_tache (tache_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (\Throwable $e) { /* silencieux */ }

try {
    if ($method === 'GET')        getList();
    elseif ($method === 'POST')   handlePost($user);
    elseif ($method === 'PUT')    updateItem($id, $user);
    elseif ($method === 'DELETE') removeItem($id);
    else jsonError('Méthode non supportée', 405);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

// ────────────────────────────────────────────────────────────
function getList() {
    $db = getDB();
    $tacheId = $_GET['tache_id'] ?? '';
    if (!$tacheId) jsonError('tache_id requis');
    $stmt = $db->prepare('SELECT * FROM CA_tache_livrables WHERE tache_id = ? ORDER BY ordre ASC, cree_at ASC');
    $stmt->execute([$tacheId]);
    jsonOk($stmt->fetchAll());
}

function handlePost(array $user) {
    $body   = getBody();
    $action = $body['action'] ?? '';
    if ($action === 'apply_catalogue') {
        applyCatalogue($body, $user);
        return;
    }
    createItem($body, $user);
}

function createItem(array $body, array $user) {
    $tacheId = $body['tache_id'] ?? '';
    $label   = trim($body['label'] ?? '');
    if (!$tacheId) jsonError('tache_id requis');
    if (!$label)   jsonError('label requis');

    $db = getDB();
    $id = bin2hex(random_bytes(16));

    $stmt = $db->prepare('SELECT COALESCE(MAX(ordre),0)+1 AS n FROM CA_tache_livrables WHERE tache_id = ?');
    $stmt->execute([$tacheId]);
    $ordre = intval(($stmt->fetch() ?: ['n'=>1])['n']);

    $db->prepare('INSERT INTO CA_tache_livrables (id,tache_id,label,done,catalogue_id,ordre,cree_par) VALUES (?,?,?,?,?,?,?)')
       ->execute([$id, $tacheId, $label, intval(!empty($body['done'])?1:0), $body['catalogue_id'] ?? null, $ordre, $user['name']]);

    $row = $db->prepare('SELECT * FROM CA_tache_livrables WHERE id = ?');
    $row->execute([$id]);
    jsonOk($row->fetch());
}

function updateItem($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CA_tache_livrables WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Livrable introuvable', 404);

    $fields = [];
    $params = [];
    if (array_key_exists('label', $body)) { $fields[] = 'label = ?';  $params[] = trim($body['label']); }
    if (array_key_exists('ordre', $body)) { $fields[] = 'ordre = ?';  $params[] = intval($body['ordre']); }
    if (array_key_exists('done',  $body)) {
        $d = !empty($body['done']) ? 1 : 0;
        $fields[] = 'done = ?';      $params[] = $d;
        $fields[] = 'done_par = ?';  $params[] = $d ? $user['name'] : null;
        $fields[] = 'done_at = ?';   $params[] = $d ? date('Y-m-d H:i:s') : null;
    }
    if (empty($fields)) jsonError('Aucun champ à mettre à jour');
    $params[] = $id;
    $db->prepare('UPDATE CA_tache_livrables SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    // Notifier si livrable validé
    if (array_key_exists('done', $body) && !empty($body['done'])) {
        try {
            $livInfo = $db->prepare('SELECT l.label, l.tache_id, t.titre AS tache_titre, t.assignee, t.projet_id, p.nom AS projet_nom
                FROM CA_tache_livrables l
                LEFT JOIN CA_taches t ON t.id = l.tache_id
                LEFT JOIN CA_projets p ON p.id = t.projet_id
                WHERE l.id = ?');
            $livInfo->execute([$id]);
            $li = $livInfo->fetch();
            if ($li) {
                $title = 'Livrable validé : ' . $li['label'];
                $msg = 'Tâche : ' . ($li['tache_titre'] ?: '—') . "\nProjet : " . ($li['projet_nom'] ?: '—') . "\nValidé par : " . ($user['name'] ?? '—');
                // Notifier l'assigné de la tâche
                if ($li['assignee'] && $li['assignee'] !== ($user['id'] ?? '')) {
                    dispatchNotification($db, $li['assignee'], 'success', $title, $msg, 'suivi', $li['tache_id'], $user['name'] ?? null);
                }
            }
        } catch (\Throwable $e) { /* silencieux */ }
    }

    $row = $db->prepare('SELECT * FROM CA_tache_livrables WHERE id = ?');
    $row->execute([$id]);
    jsonOk($row->fetch());
}

function removeItem($id) {
    if (!$id) jsonError('ID requis');
    $db = getDB();
    $db->prepare('DELETE FROM CA_tache_livrables WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}

// ────────────────────────────────────────────────────────────
//  Préremplissage depuis le catalogue (stocké dans CA_settings)
//  Matching :
//    - niveau 0 (mission)    → entries where tache_type_id == '' && sous_tache == ''
//    - niveau 1 (tâche)      → entries where tache_type_id matches && sous_tache == ''
//    - niveau 2 (sous-tâche) → entries where tache_type_id matches && (sous_tache == titre || sous_tache == '')
//  La mission est toujours filtrée (via mission_id matching missions setting).
// ────────────────────────────────────────────────────────────
function applyCatalogue(array $body, array $user) {
    $tacheId = $body['tache_id'] ?? '';
    if (!$tacheId) jsonError('tache_id requis');
    $db = getDB();

    // Charger la tâche cible et remonter la chaîne mission → tâche → sous-tâche
    $stmt = $db->prepare('SELECT * FROM CA_taches WHERE id = ?');
    $stmt->execute([$tacheId]);
    $t = $stmt->fetch();
    if (!$t) jsonError('Tâche introuvable', 404);

    $missionTitre = '';
    $tacheTitre   = '';
    $sousTitre    = '';
    if ((int)$t['niveau'] === 0) {
        $missionTitre = $t['titre'];
    } elseif ((int)$t['niveau'] === 1) {
        $tacheTitre = $t['titre'];
        if (!empty($t['parent_id'])) {
            $p = $db->prepare('SELECT titre FROM CA_taches WHERE id = ?');
            $p->execute([$t['parent_id']]);
            $pr = $p->fetch(); if ($pr) $missionTitre = $pr['titre'];
        }
    } else { // niveau 2
        $sousTitre = $t['titre'];
        if (!empty($t['parent_id'])) {
            $p = $db->prepare('SELECT titre, parent_id FROM CA_taches WHERE id = ?');
            $p->execute([$t['parent_id']]);
            $pr = $p->fetch();
            if ($pr) {
                $tacheTitre = $pr['titre'];
                if (!empty($pr['parent_id'])) {
                    $gp = $db->prepare('SELECT titre FROM CA_taches WHERE id = ?');
                    $gp->execute([$pr['parent_id']]);
                    $gpr = $gp->fetch(); if ($gpr) $missionTitre = $gpr['titre'];
                }
            }
        }
    }

    // Charger les settings requis (catalogue, missions, taches_types)
    $settings = loadSettings(['cortoba_livrables_catalogue','cortoba_missions','cortoba_taches_types']);
    $catalogue    = is_array($settings['cortoba_livrables_catalogue'] ?? null) ? $settings['cortoba_livrables_catalogue'] : [];
    $missions     = is_array($settings['cortoba_missions'] ?? null) ? $settings['cortoba_missions'] : [];
    $tachesTypes  = is_array($settings['cortoba_taches_types'] ?? null) ? $settings['cortoba_taches_types'] : [];

    // Résoudre mission_id à partir du nom
    $missionId = '';
    foreach ($missions as $m) {
        if (!empty($m['nom']) && mb_strtolower($m['nom']) === mb_strtolower($missionTitre)) {
            $missionId = $m['id'] ?? '';
            break;
        }
    }
    // Résoudre tache_type_id à partir du nom (scopé à la mission)
    $tacheTypeId = '';
    if ($tacheTitre !== '') {
        foreach ($tachesTypes as $tt) {
            if ((!$missionId || ($tt['mission_id'] ?? '') === $missionId)
                && mb_strtolower($tt['nom'] ?? '') === mb_strtolower($tacheTitre)) {
                $tacheTypeId = $tt['id'] ?? '';
                break;
            }
        }
    }

    // Filtrer le catalogue
    $matches = [];
    foreach ($catalogue as $e) {
        $eMission = $e['mission_id']    ?? '';
        $eTache   = $e['tache_type_id'] ?? '';
        $eSous    = trim($e['sous_tache'] ?? '');
        if ($missionId && $eMission && $eMission !== $missionId) continue;

        $niveau = (int)$t['niveau'];
        if ($niveau === 0) {
            // Mission : récupérer tous les items tagués "mission seule" (pas de tache ni sous)
            if ($eTache === '' && $eSous === '') $matches[] = $e;
        } elseif ($niveau === 1) {
            // Tâche : items de cette tache_type, sans sous-tâche
            if ($eTache && $tacheTypeId && $eTache === $tacheTypeId && $eSous === '') $matches[] = $e;
        } else {
            // Sous-tâche : items de cette tache_type, sous_tache == titre ou sous == ''
            if ($eTache && $tacheTypeId && $eTache === $tacheTypeId
                && ($eSous === '' || mb_strtolower($eSous) === mb_strtolower($sousTitre))) {
                $matches[] = $e;
            }
        }
    }

    // Charger les items déjà présents pour déduplication (par catalogue_id ou label)
    $stmt = $db->prepare('SELECT catalogue_id, label FROM CA_tache_livrables WHERE tache_id = ?');
    $stmt->execute([$tacheId]);
    $existing = $stmt->fetchAll();
    $existingKeys = [];
    foreach ($existing as $row) {
        if (!empty($row['catalogue_id'])) $existingKeys['cat:'.$row['catalogue_id']] = 1;
        $existingKeys['lbl:'.mb_strtolower(trim($row['label']))] = 1;
    }

    $stmtOrd = $db->prepare('SELECT COALESCE(MAX(ordre),0) AS n FROM CA_tache_livrables WHERE tache_id = ?');
    $stmtOrd->execute([$tacheId]);
    $ordre = intval(($stmtOrd->fetch() ?: ['n'=>0])['n']);

    $ins = $db->prepare('INSERT INTO CA_tache_livrables (id,tache_id,label,done,catalogue_id,ordre,cree_par) VALUES (?,?,?,0,?,?,?)');
    $added = 0;
    foreach ($matches as $m) {
        $label = trim($m['nom'] ?? $m['label'] ?? '');
        if ($label === '') continue;
        $cid = $m['id'] ?? null;
        $k1 = $cid ? ('cat:'.$cid) : null;
        $k2 = 'lbl:'.mb_strtolower($label);
        if (($k1 && isset($existingKeys[$k1])) || isset($existingKeys[$k2])) continue;
        $ordre++;
        $ins->execute([bin2hex(random_bytes(16)), $tacheId, $label, $cid, $ordre, $user['name']]);
        $existingKeys[$k2] = 1;
        if ($k1) $existingKeys[$k1] = 1;
        $added++;
    }

    // Retourner la liste à jour
    $stmt = $db->prepare('SELECT * FROM CA_tache_livrables WHERE tache_id = ? ORDER BY ordre ASC, cree_at ASC');
    $stmt->execute([$tacheId]);
    jsonOk(['added' => $added, 'items' => $stmt->fetchAll()]);
}

function loadSettings(array $keys) {
    $db = getDB();
    $out = [];
    try {
        $in  = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $db->prepare("SELECT setting_key, setting_value FROM CA_settings WHERE setting_key IN ($in)");
        $stmt->execute($keys);
        foreach ($stmt->fetchAll() as $row) {
            $dec = json_decode($row['setting_value'], true);
            $out[$row['setting_key']] = ($dec !== null) ? $dec : $row['setting_value'];
        }
    } catch (\Throwable $e) { /* table absente = vide */ }
    return $out;
}
