<?php
// ═══════════════════════════════════════════════════════════════
//  api/chantier_reunions.php — Réunions de chantier, PV, actions
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : 'reunions';
$id     = isset($_GET['id']) ? $_GET['id'] : null;
$user   = requireAuth();

try {
    if ($action === 'reunions') {
        if ($method === 'GET' && $id)     getReunion($id);
        elseif ($method === 'GET')        listReunions();
        elseif ($method === 'POST')       createReunion($user);
        elseif ($method === 'PUT')        updateReunion($id, $user);
        elseif ($method === 'DELETE')     deleteReunion($id);
    }
    elseif ($action === 'actions') {
        if ($method === 'GET')            listActions();
        elseif ($method === 'POST')       createAction($user);
        elseif ($method === 'PUT')        updateAction($id);
        elseif ($method === 'DELETE')     deleteAction($id);
    }
    elseif ($action === 'diffuser') {
        diffuserPV($id, $user);
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}

// ── RÉUNIONS ──

function listReunions() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CA_chantier_reunions WHERE chantier_id=? ORDER BY date_reunion DESC");
    $stmt->execute([$cid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['participants'] = json_decode($r['participants'] ?: '[]', true);
        $s2 = $db->prepare("SELECT * FROM CA_chantier_reunion_actions WHERE reunion_id=? ORDER BY cree_at");
        $s2->execute([$r['id']]);
        $r['actions'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    }
    jsonOk($rows);
}

function getReunion($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_chantier_reunions WHERE id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('Réunion introuvable', 404);
    $r['participants'] = json_decode($r['participants'] ?: '[]', true);
    // Actions
    $s2 = $db->prepare("SELECT * FROM CA_chantier_reunion_actions WHERE reunion_id=? ORDER BY cree_at");
    $s2->execute([$id]);
    $r['actions'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    // All open actions for this chantier (carry-over)
    $s3 = $db->prepare("SELECT a.*, r.numero AS reunion_numero FROM CA_chantier_reunion_actions a
                         JOIN CA_chantier_reunions r ON r.id = a.reunion_id
                         WHERE a.chantier_id=? AND a.statut != 'Clôturée' ORDER BY a.delai");
    $s3->execute([$r['chantier_id']]);
    $r['actions_ouvertes'] = $s3->fetchAll(PDO::FETCH_ASSOC);
    jsonOk($r);
}

function createReunion($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $cid = $b['chantier_id'] ?? '';
    // Auto-numérotation
    $s = $db->prepare("SELECT COALESCE(MAX(numero),0)+1 AS next_num FROM CA_chantier_reunions WHERE chantier_id=?");
    $s->execute([$cid]);
    $num = $s->fetch(PDO::FETCH_ASSOC)['next_num'];

    $db->prepare("INSERT INTO CA_chantier_reunions (id, chantier_id, numero, date_reunion, lieu, objet, participants, points_discutes, decisions, pv_contenu, statut, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $cid, $num, $b['date_reunion']??date('Y-m-d H:i:s'), $b['lieu']??null,
                  $b['objet']??'Réunion de chantier',
                  json_encode($b['participants']??[], JSON_UNESCAPED_UNICODE),
                  $b['points_discutes']??null, $b['decisions']??null, $b['pv_contenu']??null,
                  $b['statut']??'Brouillon', $user['name']??'']);

    // Create actions
    if (!empty($b['actions']) && is_array($b['actions'])) {
        foreach ($b['actions'] as $act) {
            $aid = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_reunion_actions (id, reunion_id, chantier_id, description, responsable, delai, statut)
                          VALUES (?,?,?,?,?,?,?)")
               ->execute([$aid, $id, $cid, $act['description']??'', $act['responsable']??null,
                          $act['delai']??null, $act['statut']??'Ouverte']);
        }
    }
    jsonOk(['id' => $id, 'numero' => $num]);
}

function updateReunion($id, $user) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_reunions SET date_reunion=?, lieu=?, objet=?,
                  participants=?, points_discutes=?, decisions=?, pv_contenu=?, statut=?
                  WHERE id=?")
       ->execute([$b['date_reunion']??date('Y-m-d H:i:s'), $b['lieu']??null,
                  $b['objet']??'Réunion de chantier',
                  json_encode($b['participants']??[], JSON_UNESCAPED_UNICODE),
                  $b['points_discutes']??null, $b['decisions']??null, $b['pv_contenu']??null,
                  $b['statut']??'Brouillon', $id]);
    jsonOk(['updated' => true]);
}

function deleteReunion($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_reunion_actions WHERE reunion_id=?")->execute([$id]);
    $db->prepare("DELETE FROM CA_chantier_reunions WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

function diffuserPV($id, $user) {
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_reunions SET statut='Diffusé', diffuse_at=NOW() WHERE id=?")
       ->execute([$id]);
    jsonOk(['diffused' => true]);
}

// ── ACTIONS ──

function listActions() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $statut = $_GET['statut'] ?? '';
    $sql = "SELECT a.*, r.numero AS reunion_numero, r.date_reunion
            FROM CA_chantier_reunion_actions a
            JOIN CA_chantier_reunions r ON r.id = a.reunion_id
            WHERE a.chantier_id=?";
    $params = [$cid];
    if ($statut) { $sql .= " AND a.statut=?"; $params[] = $statut; }
    $sql .= " ORDER BY a.delai ASC, a.cree_at ASC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createAction($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_reunion_actions (id, reunion_id, chantier_id, description, responsable, delai, statut)
                  VALUES (?,?,?,?,?,?,?)")
       ->execute([$id, $b['reunion_id']??'', $b['chantier_id']??'', $b['description']??'',
                  $b['responsable']??null, $b['delai']??null, $b['statut']??'Ouverte']);
    jsonOk(['id' => $id]);
}

function updateAction($id) {
    $b = getBody();
    $db = getDB();
    $sets = "description=?, responsable=?, delai=?, statut=?";
    $params = [$b['description']??'', $b['responsable']??null, $b['delai']??null, $b['statut']??'Ouverte'];
    if (($b['statut'] ?? '') === 'Clôturée' && !empty($b['reunion_cloture_id'])) {
        $sets .= ", reunion_cloture_id=?";
        $params[] = $b['reunion_cloture_id'];
    }
    $params[] = $id;
    $db->prepare("UPDATE CA_chantier_reunion_actions SET $sets WHERE id=?")->execute($params);
    jsonOk(['updated' => true]);
}

function deleteAction($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_reunion_actions WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}
