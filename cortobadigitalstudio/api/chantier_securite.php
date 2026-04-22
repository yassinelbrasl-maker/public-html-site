<?php
// ═══════════════════════════════════════════════════════════════
//  api/chantier_securite.php — Incidents, inspections sécurité
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();

function ensureSecuriteTables() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_chantier_incidents` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `type` VARCHAR(40) NOT NULL DEFAULT 'Incident',
      `gravite` VARCHAR(20) NOT NULL DEFAULT 'Mineure',
      `titre` VARCHAR(300) NOT NULL,
      `description` TEXT DEFAULT NULL,
      `zone` VARCHAR(120) DEFAULT NULL,
      `entreprise` VARCHAR(200) DEFAULT NULL,
      `personnes_impliquees` TEXT DEFAULT NULL,
      `date_incident` DATETIME NOT NULL,
      `mesures_immediates` TEXT DEFAULT NULL,
      `mesures_correctives` TEXT DEFAULT NULL,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'Ouvert',
      `date_cloture` DATE DEFAULT NULL,
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`),
      KEY `idx_type` (`type`),
      KEY `idx_statut` (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_chantier_inspections` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `titre` VARCHAR(200) NOT NULL DEFAULT 'Inspection sécurité',
      `date_inspection` DATE NOT NULL,
      `inspecteur` VARCHAR(200) DEFAULT NULL,
      `zone` VARCHAR(120) DEFAULT NULL,
      `checklist` LONGTEXT DEFAULT NULL,
      `score` INT DEFAULT NULL,
      `observations` TEXT DEFAULT NULL,
      `actions_requises` LONGTEXT DEFAULT NULL,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'Complétée',
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`),
      KEY `idx_date` (`date_inspection`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}
try { ensureSecuriteTables(); } catch (\Throwable $e) {}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : 'incidents';
$id     = isset($_GET['id']) ? $_GET['id'] : null;
$user   = requireAuth();

try {
    if ($action === 'incidents') {
        if ($method === 'GET' && $id)     getIncident($id);
        elseif ($method === 'GET')        listIncidents();
        elseif ($method === 'POST')       createIncident($user);
        elseif ($method === 'PUT')        updateIncident($id);
        elseif ($method === 'DELETE')     deleteIncident($id);
    }
    elseif ($action === 'inspections') {
        if ($method === 'GET' && $id)     getInspection($id);
        elseif ($method === 'GET')        listInspections();
        elseif ($method === 'POST')       createInspection($user);
        elseif ($method === 'PUT')        updateInspection($id);
        elseif ($method === 'DELETE')     deleteInspection($id);
    }
    elseif ($action === 'stats') {
        getSecuriteStats();
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError($e->getMessage(), 500);
}

// ══════════════════════════════════════
//  INCIDENTS
// ══════════════════════════════════════

function listIncidents() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $type = $_GET['type'] ?? '';
    $statut = $_GET['statut'] ?? '';
    $sql = "SELECT * FROM CDS_chantier_incidents WHERE chantier_id=?";
    $params = [$cid];
    if ($type)   { $sql .= " AND type=?"; $params[] = $type; }
    if ($statut) { $sql .= " AND statut=?"; $params[] = $statut; }
    $sql .= " ORDER BY date_incident DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function getIncident($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CDS_chantier_incidents WHERE id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('Incident introuvable', 404);
    jsonOk($r);
}

function createIncident($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CDS_chantier_incidents (id, chantier_id, type, gravite, titre, description,
                  zone, entreprise, personnes_impliquees, date_incident, mesures_immediates,
                  mesures_correctives, statut, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['type']??'Incident', $b['gravite']??'Mineure',
                  $b['titre']??'', $b['description']??null, $b['zone']??null,
                  $b['entreprise']??null, $b['personnes_impliquees']??null,
                  $b['date_incident']??date('Y-m-d H:i:s'), $b['mesures_immediates']??null,
                  $b['mesures_correctives']??null, $b['statut']??'Ouvert', $user['name']??'']);
    jsonOk(['id' => $id]);
}

function updateIncident($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CDS_chantier_incidents SET type=?, gravite=?, titre=?, description=?,
                  zone=?, entreprise=?, personnes_impliquees=?, date_incident=?, mesures_immediates=?,
                  mesures_correctives=?, statut=?, date_cloture=? WHERE id=?")
       ->execute([$b['type']??'Incident', $b['gravite']??'Mineure', $b['titre']??'',
                  $b['description']??null, $b['zone']??null, $b['entreprise']??null,
                  $b['personnes_impliquees']??null, $b['date_incident']??null,
                  $b['mesures_immediates']??null, $b['mesures_correctives']??null,
                  $b['statut']??'Ouvert', $b['date_cloture']??null, $id]);
    jsonOk(['updated' => true]);
}

function deleteIncident($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CDS_chantier_incidents WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  INSPECTIONS
// ══════════════════════════════════════

function listInspections() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CDS_chantier_inspections WHERE chantier_id=? ORDER BY date_inspection DESC");
    $stmt->execute([$cid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['checklist'] = json_decode($r['checklist'] ?: '[]', true);
        $r['actions_requises'] = json_decode($r['actions_requises'] ?: '[]', true);
    }
    jsonOk($rows);
}

function getInspection($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CDS_chantier_inspections WHERE id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) jsonError('Inspection introuvable', 404);
    $r['checklist'] = json_decode($r['checklist'] ?: '[]', true);
    $r['actions_requises'] = json_decode($r['actions_requises'] ?: '[]', true);
    jsonOk($r);
}

function createInspection($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    // Calculate score from checklist
    $checklist = $b['checklist'] ?? [];
    $score = null;
    if (count($checklist) > 0) {
        $conforme = 0;
        foreach ($checklist as $item) {
            if (!empty($item['conforme'])) $conforme++;
        }
        $score = round(($conforme / count($checklist)) * 100);
    }
    $db->prepare("INSERT INTO CDS_chantier_inspections (id, chantier_id, titre, date_inspection,
                  inspecteur, zone, checklist, score, observations, actions_requises, statut, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['titre']??'Inspection sécurité',
                  $b['date_inspection']??date('Y-m-d'), $b['inspecteur']??null, $b['zone']??null,
                  json_encode($checklist, JSON_UNESCAPED_UNICODE), $score,
                  $b['observations']??null,
                  json_encode($b['actions_requises']??[], JSON_UNESCAPED_UNICODE),
                  $b['statut']??'Complétée', $user['name']??'']);
    jsonOk(['id' => $id, 'score' => $score]);
}

function updateInspection($id) {
    $b = getBody();
    $db = getDB();
    $checklist = $b['checklist'] ?? [];
    $score = null;
    if (count($checklist) > 0) {
        $conforme = 0;
        foreach ($checklist as $item) {
            if (!empty($item['conforme'])) $conforme++;
        }
        $score = round(($conforme / count($checklist)) * 100);
    }
    $db->prepare("UPDATE CDS_chantier_inspections SET titre=?, date_inspection=?, inspecteur=?,
                  zone=?, checklist=?, score=?, observations=?, actions_requises=?, statut=? WHERE id=?")
       ->execute([$b['titre']??'Inspection sécurité', $b['date_inspection']??null,
                  $b['inspecteur']??null, $b['zone']??null,
                  json_encode($checklist, JSON_UNESCAPED_UNICODE), $score,
                  $b['observations']??null,
                  json_encode($b['actions_requises']??[], JSON_UNESCAPED_UNICODE),
                  $b['statut']??'Complétée', $id]);
    jsonOk(['updated' => true, 'score' => $score]);
}

function deleteInspection($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CDS_chantier_inspections WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  STATISTIQUES SÉCURITÉ
// ══════════════════════════════════════

function getSecuriteStats() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';

    // Incidents par type
    $s1 = $db->prepare("SELECT type, gravite, COUNT(*) as nb FROM CDS_chantier_incidents WHERE chantier_id=? GROUP BY type, gravite");
    $s1->execute([$cid]);
    $incidents = $s1->fetchAll(PDO::FETCH_ASSOC);

    // Incidents par mois
    $s2 = $db->prepare("SELECT DATE_FORMAT(date_incident, '%Y-%m') as mois, COUNT(*) as nb
                         FROM CDS_chantier_incidents WHERE chantier_id=?
                         GROUP BY DATE_FORMAT(date_incident, '%Y-%m') ORDER BY mois");
    $s2->execute([$cid]);
    $tendance = $s2->fetchAll(PDO::FETCH_ASSOC);

    // Inspections recent scores
    $s3 = $db->prepare("SELECT date_inspection, score, titre FROM CDS_chantier_inspections
                         WHERE chantier_id=? AND score IS NOT NULL ORDER BY date_inspection DESC LIMIT 10");
    $s3->execute([$cid]);
    $scores = $s3->fetchAll(PDO::FETCH_ASSOC);

    // Open corrective actions
    $s4 = $db->prepare("SELECT COUNT(*) as nb FROM CDS_chantier_incidents WHERE chantier_id=? AND statut='Ouvert'");
    $s4->execute([$cid]);
    $ouverts = $s4->fetch(PDO::FETCH_ASSOC)['nb'];

    jsonOk([
        'incidents_par_type' => $incidents,
        'tendance_mensuelle' => $tendance,
        'scores_inspections' => $scores,
        'incidents_ouverts'  => $ouverts
    ]);
}
