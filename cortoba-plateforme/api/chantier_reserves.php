<?php
// ═══════════════════════════════════════════════════════════════
//  api/chantier_reserves.php — Réserves (punch list), RFI, Visas
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : 'reserves';
$id     = isset($_GET['id']) ? $_GET['id'] : null;
$user   = requireAuth();

try {
    if ($action === 'reserves') {
        if ($method === 'GET' && $id)     getReserve($id);
        elseif ($method === 'GET')        listReserves();
        elseif ($method === 'POST')       createReserve($user);
        elseif ($method === 'PUT')        updateReserve($id);
        elseif ($method === 'DELETE')     deleteReserve($id);
    }
    elseif ($action === 'rfi') {
        if ($method === 'GET' && $id)     getRfi($id);
        elseif ($method === 'GET')        listRfi();
        elseif ($method === 'POST')       createRfi($user);
        elseif ($method === 'PUT')        updateRfi($id);
        elseif ($method === 'DELETE')     deleteRfi($id);
    }
    elseif ($action === 'visas') {
        if ($method === 'GET' && $id)     getVisa($id);
        elseif ($method === 'GET')        listVisas();
        elseif ($method === 'POST')       createVisa($user);
        elseif ($method === 'PUT')        updateVisa($id);
        elseif ($method === 'DELETE')     deleteVisa($id);
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}

// ══════════════════════════════════════
//  RÉSERVES (PUNCH LIST)
// ══════════════════════════════════════

function listReserves() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $statut = $_GET['statut'] ?? '';
    $lot = $_GET['lot_id'] ?? '';
    $sql = "SELECT r.*, l.nom AS lot_nom FROM CA_chantier_reserves r
            LEFT JOIN CA_chantier_lots l ON l.id = r.lot_id
            WHERE r.chantier_id=?";
    $params = [$cid];
    if ($statut) { $sql .= " AND r.statut=?"; $params[] = $statut; }
    if ($lot)    { $sql .= " AND r.lot_id=?"; $params[] = $lot; }
    $sql .= " ORDER BY r.numero DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function getReserve($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT r.*, l.nom AS lot_nom FROM CA_chantier_reserves r
                          LEFT JOIN CA_chantier_lots l ON l.id = r.lot_id WHERE r.id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('Réserve introuvable', 404);
    // Attach photos
    $s2 = $db->prepare("SELECT * FROM CA_chantier_photos WHERE reserve_id=? ORDER BY cree_at");
    $s2->execute([$id]);
    $r['photos'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    jsonOk($r);
}

function createReserve($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $cid = $b['chantier_id'] ?? '';
    // Auto-numérotation
    $s = $db->prepare("SELECT COALESCE(MAX(numero),0)+1 AS n FROM CA_chantier_reserves WHERE chantier_id=?");
    $s->execute([$cid]);
    $num = $s->fetch(PDO::FETCH_ASSOC)['n'];

    $db->prepare("INSERT INTO CA_chantier_reserves (id, chantier_id, lot_id, numero, titre, description,
                  zone, localisation_x, localisation_y, plan_ref, entreprise, priorite, statut,
                  date_constat, date_delai, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $cid, $b['lot_id']??null, $num, $b['titre']??'', $b['description']??null,
                  $b['zone']??null, $b['localisation_x']??null, $b['localisation_y']??null,
                  $b['plan_ref']??null, $b['entreprise']??null, $b['priorite']??'Normale',
                  $b['statut']??'Ouverte', $b['date_constat']??date('Y-m-d'),
                  $b['date_delai']??null, $user['name']??'']);
    jsonOk(['id' => $id, 'numero' => $num]);
}

function updateReserve($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_reserves SET lot_id=?, titre=?, description=?, zone=?,
                  localisation_x=?, localisation_y=?, plan_ref=?, entreprise=?, priorite=?, statut=?,
                  date_constat=?, date_delai=?, date_levee=?, levee_par=? WHERE id=?")
       ->execute([$b['lot_id']??null, $b['titre']??'', $b['description']??null, $b['zone']??null,
                  $b['localisation_x']??null, $b['localisation_y']??null, $b['plan_ref']??null,
                  $b['entreprise']??null, $b['priorite']??'Normale', $b['statut']??'Ouverte',
                  $b['date_constat']??null, $b['date_delai']??null, $b['date_levee']??null,
                  $b['levee_par']??null, $id]);
    jsonOk(['updated' => true]);
}

function deleteReserve($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_reserves WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  RFI (DEMANDES D'INFORMATION)
// ══════════════════════════════════════

function listRfi() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $statut = $_GET['statut'] ?? '';
    $sql = "SELECT * FROM CA_chantier_rfi WHERE chantier_id=?";
    $params = [$cid];
    if ($statut) { $sql .= " AND statut=?"; $params[] = $statut; }
    $sql .= " ORDER BY numero DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function getRfi($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_chantier_rfi WHERE id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('RFI introuvable', 404);
    jsonOk($r);
}

function createRfi($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $cid = $b['chantier_id'] ?? '';
    $s = $db->prepare("SELECT COALESCE(MAX(numero),0)+1 AS n FROM CA_chantier_rfi WHERE chantier_id=?");
    $s->execute([$cid]);
    $num = $s->fetch(PDO::FETCH_ASSOC)['n'];

    $db->prepare("INSERT INTO CA_chantier_rfi (id, chantier_id, numero, objet, description, documents_ref,
                  emetteur, destinataire, statut, priorite, date_emission, date_reponse_attendue, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $cid, $num, $b['objet']??'', $b['description']??null, $b['documents_ref']??null,
                  $b['emetteur']??null, $b['destinataire']??null, $b['statut']??'Ouverte',
                  $b['priorite']??'Normale', $b['date_emission']??date('Y-m-d'),
                  $b['date_reponse_attendue']??null, $user['name']??'']);
    jsonOk(['id' => $id, 'numero' => $num]);
}

function updateRfi($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_rfi SET objet=?, description=?, documents_ref=?, emetteur=?,
                  destinataire=?, statut=?, priorite=?, date_emission=?, date_reponse_attendue=?,
                  date_reponse=?, reponse=?, repondu_par=? WHERE id=?")
       ->execute([$b['objet']??'', $b['description']??null, $b['documents_ref']??null,
                  $b['emetteur']??null, $b['destinataire']??null, $b['statut']??'Ouverte',
                  $b['priorite']??'Normale', $b['date_emission']??null,
                  $b['date_reponse_attendue']??null, $b['date_reponse']??null,
                  $b['reponse']??null, $b['repondu_par']??null, $id]);
    jsonOk(['updated' => true]);
}

function deleteRfi($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_rfi WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  VISAS
// ══════════════════════════════════════

function listVisas() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $statut = $_GET['statut'] ?? '';
    $sql = "SELECT v.*, l.nom AS lot_nom FROM CA_chantier_visas v
            LEFT JOIN CA_chantier_lots l ON l.id = v.lot_id
            WHERE v.chantier_id=?";
    $params = [$cid];
    if ($statut) { $sql .= " AND v.statut=?"; $params[] = $statut; }
    $sql .= " ORDER BY v.numero DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['circuit_visa'] = json_decode($r['circuit_visa'] ?: '[]', true);
    }
    jsonOk($rows);
}

function getVisa($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT v.*, l.nom AS lot_nom FROM CA_chantier_visas v
                          LEFT JOIN CA_chantier_lots l ON l.id = v.lot_id WHERE v.id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('Visa introuvable', 404);
    $r['circuit_visa'] = json_decode($r['circuit_visa'] ?: '[]', true);
    jsonOk($r);
}

function createVisa($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $cid = $b['chantier_id'] ?? '';
    $s = $db->prepare("SELECT COALESCE(MAX(numero),0)+1 AS n FROM CA_chantier_visas WHERE chantier_id=?");
    $s->execute([$cid]);
    $num = $s->fetch(PDO::FETCH_ASSOC)['n'];

    $db->prepare("INSERT INTO CA_chantier_visas (id, chantier_id, lot_id, numero, document_titre, document_ref,
                  document_url, emetteur, circuit_visa, statut, date_reception, commentaire, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $cid, $b['lot_id']??null, $num, $b['document_titre']??'', $b['document_ref']??null,
                  $b['document_url']??null, $b['emetteur']??null,
                  json_encode($b['circuit_visa']??[], JSON_UNESCAPED_UNICODE),
                  $b['statut']??'En attente', $b['date_reception']??date('Y-m-d'),
                  $b['commentaire']??null, $user['name']??'']);
    jsonOk(['id' => $id, 'numero' => $num]);
}

function updateVisa($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_visas SET lot_id=?, document_titre=?, document_ref=?, document_url=?,
                  emetteur=?, circuit_visa=?, statut=?, date_reception=?, date_visa=?, commentaire=? WHERE id=?")
       ->execute([$b['lot_id']??null, $b['document_titre']??'', $b['document_ref']??null,
                  $b['document_url']??null, $b['emetteur']??null,
                  json_encode($b['circuit_visa']??[], JSON_UNESCAPED_UNICODE),
                  $b['statut']??'En attente', $b['date_reception']??null,
                  $b['date_visa']??null, $b['commentaire']??null, $id]);
    jsonOk(['updated' => true]);
}

function deleteVisa($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_visas WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}
