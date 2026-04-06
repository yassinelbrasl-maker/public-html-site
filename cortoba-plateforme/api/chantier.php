<?php
// ═══════════════════════════════════════════════════════════════
//  api/chantier.php — Gestion de chantier : CRUD chantiers,
//  lots, journal quotidien, effectifs, intervenants
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';
$id     = isset($_GET['id']) ? $_GET['id'] : null;
$user   = requireAuth();

try {
    // ── Chantiers ──
    if ($action === '' || $action === 'chantiers') {
        if ($method === 'GET' && $id)     getChantier($id);
        elseif ($method === 'GET')        listChantiers();
        elseif ($method === 'POST')       createChantier($user);
        elseif ($method === 'PUT')        updateChantier($id, $user);
        elseif ($method === 'DELETE')     deleteChantier($id);
    }
    // ── Lots ──
    elseif ($action === 'lots') {
        if ($method === 'GET')            listLots();
        elseif ($method === 'POST')       createLot($user);
        elseif ($method === 'PUT')        updateLot($id);
        elseif ($method === 'DELETE')     deleteLot($id);
    }
    // ── Journal quotidien ──
    elseif ($action === 'journal') {
        if ($method === 'GET')            listJournal();
        elseif ($method === 'POST')       createJournal($user);
        elseif ($method === 'PUT')        updateJournal($id, $user);
        elseif ($method === 'DELETE')     deleteJournal($id);
    }
    // ── Effectifs ──
    elseif ($action === 'effectifs') {
        if ($method === 'GET')            listEffectifs();
        elseif ($method === 'POST')       saveEffectifs($user);
    }
    // ── Intervenants ──
    elseif ($action === 'intervenants') {
        if ($method === 'GET')            listIntervenants();
        elseif ($method === 'POST')       createIntervenant($user);
        elseif ($method === 'PUT')        updateIntervenant($id);
        elseif ($method === 'DELETE')     deleteIntervenant($id);
    }
    // ── Tâches planification (Gantt) ──
    elseif ($action === 'taches') {
        if ($method === 'GET')            listTachesChantier();
        elseif ($method === 'POST')       createTacheChantier($user);
        elseif ($method === 'PUT')        updateTacheChantier($id);
        elseif ($method === 'DELETE')     deleteTacheChantier($id);
    }
    // ── Dashboard ──
    elseif ($action === 'dashboard') {
        getDashboard();
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}

// ══════════════════════════════════════
//  CHANTIERS
// ══════════════════════════════════════

function listChantiers() {
    $db = getDB();
    $sql = "SELECT c.*, p.nom AS projet_nom, p.code AS projet_code
            FROM CA_chantiers c
            LEFT JOIN CA_projets p ON p.id = c.projet_id
            ORDER BY c.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute();
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function getChantier($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT c.*, p.nom AS projet_nom, p.code AS projet_code
                          FROM CA_chantiers c
                          LEFT JOIN CA_projets p ON p.id = c.projet_id
                          WHERE c.id = ?");
    $stmt->execute([$id]);
    $ch = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$ch) jsonError('Chantier introuvable', 404);

    // Lots
    $s2 = $db->prepare("SELECT * FROM CA_chantier_lots WHERE chantier_id = ? ORDER BY ordre, cree_at");
    $s2->execute([$id]);
    $ch['lots'] = $s2->fetchAll(PDO::FETCH_ASSOC);

    // Intervenants
    $s3 = $db->prepare("SELECT * FROM CA_chantier_intervenants WHERE chantier_id = ? ORDER BY role, nom");
    $s3->execute([$id]);
    $ch['intervenants'] = $s3->fetchAll(PDO::FETCH_ASSOC);

    jsonOk($ch);
}

function createChantier($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantiers (id, projet_id, nom, code, adresse, lat, lng,
                  date_debut, date_fin_prevue, statut, budget_travaux, description, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id,
           $b['projet_id'] ?? '',
           $b['nom'] ?? '',
           $b['code'] ?? null,
           $b['adresse'] ?? null,
           $b['lat'] ?? null,
           $b['lng'] ?? null,
           $b['date_debut'] ?? null,
           $b['date_fin_prevue'] ?? null,
           $b['statut'] ?? 'En préparation',
           $b['budget_travaux'] ?? 0,
           $b['description'] ?? null,
           $user['name'] ?? ''
       ]);
    jsonOk(['id' => $id]);
}

function updateChantier($id, $user) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantiers SET
                  projet_id=?, nom=?, code=?, adresse=?, lat=?, lng=?,
                  date_debut=?, date_fin_prevue=?, date_fin_reelle=?,
                  statut=?, avancement_global=?, budget_travaux=?, montant_engage=?,
                  description=?
                  WHERE id=?")
       ->execute([
           $b['projet_id'] ?? '',
           $b['nom'] ?? '',
           $b['code'] ?? null,
           $b['adresse'] ?? null,
           $b['lat'] ?? null,
           $b['lng'] ?? null,
           $b['date_debut'] ?? null,
           $b['date_fin_prevue'] ?? null,
           $b['date_fin_reelle'] ?? null,
           $b['statut'] ?? 'En préparation',
           $b['avancement_global'] ?? 0,
           $b['budget_travaux'] ?? 0,
           $b['montant_engage'] ?? 0,
           $b['description'] ?? null,
           $id
       ]);
    jsonOk(['updated' => true]);
}

function deleteChantier($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantiers WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  LOTS
// ══════════════════════════════════════

function listLots() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CA_chantier_lots WHERE chantier_id=? ORDER BY ordre, cree_at");
    $stmt->execute([$cid]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createLot($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_lots (id, chantier_id, code, nom, entreprise, montant_marche, date_debut, date_fin_prevue, ordre, couleur)
                  VALUES (?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['code']??null, $b['nom']??'', $b['entreprise']??null,
                  $b['montant_marche']??0, $b['date_debut']??null, $b['date_fin_prevue']??null,
                  $b['ordre']??0, $b['couleur']??'#c8a96e']);
    jsonOk(['id' => $id]);
}

function updateLot($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_lots SET code=?, nom=?, entreprise=?, montant_marche=?,
                  avancement=?, date_debut=?, date_fin_prevue=?, ordre=?, couleur=? WHERE id=?")
       ->execute([$b['code']??null, $b['nom']??'', $b['entreprise']??null, $b['montant_marche']??0,
                  $b['avancement']??0, $b['date_debut']??null, $b['date_fin_prevue']??null,
                  $b['ordre']??0, $b['couleur']??'#c8a96e', $id]);
    jsonOk(['updated' => true]);
}

function deleteLot($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_lots WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  JOURNAL QUOTIDIEN
// ══════════════════════════════════════

function listJournal() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $sql = "SELECT * FROM CA_chantier_journal WHERE chantier_id=? ORDER BY date_jour DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute([$cid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Attach effectifs
    foreach ($rows as &$r) {
        $s2 = $db->prepare("SELECT * FROM CA_chantier_effectifs WHERE journal_id=?");
        $s2->execute([$r['id']]);
        $r['effectifs'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    }
    jsonOk($rows);
}

function createJournal($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_journal (id, chantier_id, date_jour, meteo, temperature,
                  effectif_total, activites, livraisons, visiteurs, retards, observations, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['date_jour']??date('Y-m-d'),
                  $b['meteo']??null, $b['temperature']??null, $b['effectif_total']??0,
                  $b['activites']??null, $b['livraisons']??null, $b['visiteurs']??null,
                  $b['retards']??null, $b['observations']??null, $user['name']??'']);
    // Save effectifs
    if (!empty($b['effectifs']) && is_array($b['effectifs'])) {
        foreach ($b['effectifs'] as $eff) {
            $eid = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_effectifs (id, journal_id, chantier_id, entreprise, nb_ouvriers, nb_cadres, commentaire)
                          VALUES (?,?,?,?,?,?,?)")
               ->execute([$eid, $id, $b['chantier_id']??'', $eff['entreprise']??'',
                          $eff['nb_ouvriers']??0, $eff['nb_cadres']??0, $eff['commentaire']??null]);
        }
    }
    jsonOk(['id' => $id]);
}

function updateJournal($id, $user) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_journal SET date_jour=?, meteo=?, temperature=?,
                  effectif_total=?, activites=?, livraisons=?, visiteurs=?, retards=?, observations=?
                  WHERE id=?")
       ->execute([$b['date_jour']??date('Y-m-d'), $b['meteo']??null, $b['temperature']??null,
                  $b['effectif_total']??0, $b['activites']??null, $b['livraisons']??null,
                  $b['visiteurs']??null, $b['retards']??null, $b['observations']??null, $id]);
    // Refresh effectifs
    $db->prepare("DELETE FROM CA_chantier_effectifs WHERE journal_id=?")->execute([$id]);
    if (!empty($b['effectifs']) && is_array($b['effectifs'])) {
        $cid = $b['chantier_id'] ?? '';
        foreach ($b['effectifs'] as $eff) {
            $eid = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_effectifs (id, journal_id, chantier_id, entreprise, nb_ouvriers, nb_cadres, commentaire)
                          VALUES (?,?,?,?,?,?,?)")
               ->execute([$eid, $id, $cid, $eff['entreprise']??'', $eff['nb_ouvriers']??0, $eff['nb_cadres']??0, $eff['commentaire']??null]);
        }
    }
    jsonOk(['updated' => true]);
}

function deleteJournal($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_effectifs WHERE journal_id=?")->execute([$id]);
    $db->prepare("DELETE FROM CA_chantier_journal WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  EFFECTIFS
// ══════════════════════════════════════

function listEffectifs() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT e.*, j.date_jour FROM CA_chantier_effectifs e
                          JOIN CA_chantier_journal j ON j.id = e.journal_id
                          WHERE e.chantier_id=? ORDER BY j.date_jour DESC");
    $stmt->execute([$cid]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function saveEffectifs($user) {
    $b = getBody();
    $db = getDB();
    $jid = $b['journal_id'] ?? '';
    $cid = $b['chantier_id'] ?? '';
    $db->prepare("DELETE FROM CA_chantier_effectifs WHERE journal_id=?")->execute([$jid]);
    if (!empty($b['effectifs']) && is_array($b['effectifs'])) {
        foreach ($b['effectifs'] as $eff) {
            $eid = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_effectifs (id, journal_id, chantier_id, entreprise, nb_ouvriers, nb_cadres, commentaire)
                          VALUES (?,?,?,?,?,?,?)")
               ->execute([$eid, $jid, $cid, $eff['entreprise']??'', $eff['nb_ouvriers']??0, $eff['nb_cadres']??0, $eff['commentaire']??null]);
        }
    }
    jsonOk(['saved' => true]);
}

// ══════════════════════════════════════
//  INTERVENANTS
// ══════════════════════════════════════

function listIntervenants() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CA_chantier_intervenants WHERE chantier_id=? ORDER BY role, nom");
    $stmt->execute([$cid]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createIntervenant($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_intervenants (id, chantier_id, role, nom, societe, tel, email, responsabilites, acces_portail)
                  VALUES (?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['role']??'', $b['nom']??'', $b['societe']??null,
                  $b['tel']??null, $b['email']??null, $b['responsabilites']??null, $b['acces_portail']??0]);
    jsonOk(['id' => $id]);
}

function updateIntervenant($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_intervenants SET role=?, nom=?, societe=?, tel=?, email=?, responsabilites=?, acces_portail=? WHERE id=?")
       ->execute([$b['role']??'', $b['nom']??'', $b['societe']??null, $b['tel']??null,
                  $b['email']??null, $b['responsabilites']??null, $b['acces_portail']??0, $id]);
    jsonOk(['updated' => true]);
}

function deleteIntervenant($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_intervenants WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  TÂCHES PLANIFICATION (GANTT)
// ══════════════════════════════════════

function listTachesChantier() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT t.*, l.nom AS lot_nom, l.couleur AS lot_couleur
                          FROM CA_chantier_taches t
                          LEFT JOIN CA_chantier_lots l ON l.id = t.lot_id
                          WHERE t.chantier_id=? ORDER BY t.ordre, t.date_debut");
    $stmt->execute([$cid]);
    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Attach dependencies
    foreach ($tasks as &$t) {
        $s2 = $db->prepare("SELECT * FROM CA_chantier_tache_deps WHERE task_id=?");
        $s2->execute([$t['id']]);
        $t['dependencies'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    }
    jsonOk($tasks);
}

function createTacheChantier($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_taches (id, chantier_id, lot_id, parent_id, titre, date_debut, date_fin, duree_jours, avancement, est_jalon, est_critique, ordre)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['lot_id']??null, $b['parent_id']??null,
                  $b['titre']??'', $b['date_debut']??null, $b['date_fin']??null,
                  $b['duree_jours']??0, $b['avancement']??0, $b['est_jalon']??0,
                  $b['est_critique']??0, $b['ordre']??0]);
    // Dependencies
    if (!empty($b['dependencies']) && is_array($b['dependencies'])) {
        foreach ($b['dependencies'] as $dep) {
            $did = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_tache_deps (id, task_id, depends_on, type, lag_days) VALUES (?,?,?,?,?)")
               ->execute([$did, $id, $dep['depends_on']??'', $dep['type']??'FS', $dep['lag_days']??0]);
        }
    }
    jsonOk(['id' => $id]);
}

function updateTacheChantier($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_taches SET lot_id=?, parent_id=?, titre=?, date_debut=?, date_fin=?,
                  duree_jours=?, avancement=?, est_jalon=?, est_critique=?, ordre=? WHERE id=?")
       ->execute([$b['lot_id']??null, $b['parent_id']??null, $b['titre']??'',
                  $b['date_debut']??null, $b['date_fin']??null, $b['duree_jours']??0,
                  $b['avancement']??0, $b['est_jalon']??0, $b['est_critique']??0, $b['ordre']??0, $id]);
    // Refresh dependencies
    $db->prepare("DELETE FROM CA_chantier_tache_deps WHERE task_id=?")->execute([$id]);
    if (!empty($b['dependencies']) && is_array($b['dependencies'])) {
        foreach ($b['dependencies'] as $dep) {
            $did = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_tache_deps (id, task_id, depends_on, type, lag_days) VALUES (?,?,?,?,?)")
               ->execute([$did, $id, $dep['depends_on']??'', $dep['type']??'FS', $dep['lag_days']??0]);
        }
    }
    jsonOk(['updated' => true]);
}

function deleteTacheChantier($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_tache_deps WHERE task_id=?")->execute([$id]);
    $db->prepare("DELETE FROM CA_chantier_taches WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════

function getDashboard() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';

    $ch = $db->prepare("SELECT * FROM CA_chantiers WHERE id=?");
    $ch->execute([$cid]);
    $data = $ch->fetch(PDO::FETCH_ASSOC);
    if (!$data) jsonError('Chantier introuvable', 404);

    // Lots summary
    $s1 = $db->prepare("SELECT COUNT(*) as total, AVG(avancement) as avg_avancement FROM CA_chantier_lots WHERE chantier_id=?");
    $s1->execute([$cid]);
    $data['lots_summary'] = $s1->fetch(PDO::FETCH_ASSOC);

    // Reserves stats
    $s2 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_reserves WHERE chantier_id=? GROUP BY statut");
    $s2->execute([$cid]);
    $data['reserves_stats'] = $s2->fetchAll(PDO::FETCH_ASSOC);

    // RFI stats
    $s3 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_rfi WHERE chantier_id=? GROUP BY statut");
    $s3->execute([$cid]);
    $data['rfi_stats'] = $s3->fetchAll(PDO::FETCH_ASSOC);

    // Visa stats
    $s4 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_visas WHERE chantier_id=? GROUP BY statut");
    $s4->execute([$cid]);
    $data['visa_stats'] = $s4->fetchAll(PDO::FETCH_ASSOC);

    // Incidents stats
    $s5 = $db->prepare("SELECT type, COUNT(*) as nb FROM CA_chantier_incidents WHERE chantier_id=? GROUP BY type");
    $s5->execute([$cid]);
    $data['incidents_stats'] = $s5->fetchAll(PDO::FETCH_ASSOC);

    // Recent journal
    $s6 = $db->prepare("SELECT * FROM CA_chantier_journal WHERE chantier_id=? ORDER BY date_jour DESC LIMIT 5");
    $s6->execute([$cid]);
    $data['recent_journal'] = $s6->fetchAll(PDO::FETCH_ASSOC);

    // Open actions
    $s7 = $db->prepare("SELECT COUNT(*) as nb FROM CA_chantier_reunion_actions WHERE chantier_id=? AND statut != 'Clôturée'");
    $s7->execute([$cid]);
    $data['actions_ouvertes'] = $s7->fetch(PDO::FETCH_ASSOC)['nb'];

    jsonOk($data);
}
