<?php
// ═══════════════════════════════════════════════════════════════
//  api/chantier.php — Gestion de chantier : CRUD chantiers,
//  lots, journal quotidien, effectifs, intervenants
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
setCorsHeaders();

// Catch fatal/parse errors and return JSON instead of empty response
register_shutdown_function(function() {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => $e['message'] . ' (' . basename($e['file']) . ':' . $e['line'] . ')']);
    }
});

// Auto-création des tables si elles n'existent pas
function ensureChantierTables() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantiers` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `projet_id` VARCHAR(32) NOT NULL,
      `nom` VARCHAR(200) NOT NULL,
      `code` VARCHAR(30) DEFAULT NULL,
      `adresse` TEXT DEFAULT NULL,
      `lat` DECIMAL(10,7) DEFAULT NULL,
      `lng` DECIMAL(10,7) DEFAULT NULL,
      `date_debut` DATE DEFAULT NULL,
      `date_fin_prevue` DATE DEFAULT NULL,
      `date_fin_reelle` DATE DEFAULT NULL,
      `statut` VARCHAR(40) NOT NULL DEFAULT 'En préparation',
      `avancement_global` INT NOT NULL DEFAULT 0,
      `budget_travaux` DECIMAL(14,2) DEFAULT 0,
      `montant_engage` DECIMAL(14,2) DEFAULT 0,
      `description` TEXT DEFAULT NULL,
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_projet` (`projet_id`),
      KEY `idx_statut` (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_lots` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `code` VARCHAR(20) DEFAULT NULL,
      `nom` VARCHAR(200) NOT NULL,
      `entreprise` VARCHAR(200) DEFAULT NULL,
      `montant_marche` DECIMAL(14,2) DEFAULT 0,
      `avancement` INT NOT NULL DEFAULT 0,
      `date_debut` DATE DEFAULT NULL,
      `date_fin_prevue` DATE DEFAULT NULL,
      `ordre` INT NOT NULL DEFAULT 0,
      `couleur` VARCHAR(9) DEFAULT '#c8a96e',
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_taches` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `lot_id` VARCHAR(32) DEFAULT NULL,
      `parent_id` VARCHAR(32) DEFAULT NULL,
      `titre` VARCHAR(200) NOT NULL,
      `date_debut` DATE DEFAULT NULL,
      `date_fin` DATE DEFAULT NULL,
      `duree_jours` INT DEFAULT 0,
      `avancement` INT NOT NULL DEFAULT 0,
      `est_jalon` TINYINT(1) NOT NULL DEFAULT 0,
      `est_critique` TINYINT(1) NOT NULL DEFAULT 0,
      `ordre` INT NOT NULL DEFAULT 0,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`),
      KEY `idx_lot` (`lot_id`),
      KEY `idx_parent` (`parent_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_tache_deps` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `task_id` VARCHAR(32) NOT NULL,
      `depends_on` VARCHAR(32) NOT NULL,
      `type` VARCHAR(10) NOT NULL DEFAULT 'FS',
      `lag_days` INT NOT NULL DEFAULT 0,
      UNIQUE KEY `uq_dep` (`task_id`, `depends_on`),
      KEY `idx_task` (`task_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_journal` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `numero` INT NOT NULL DEFAULT 1,
      `date_jour` DATE NOT NULL,
      `heure_debut` VARCHAR(5) DEFAULT NULL,
      `heure_fin` VARCHAR(5) DEFAULT NULL,
      `phase_lot` VARCHAR(120) DEFAULT NULL,
      `meteo` VARCHAR(40) DEFAULT NULL,
      `temperature` VARCHAR(20) DEFAULT NULL,
      `effectif_total` INT DEFAULT 0,
      `activites` LONGTEXT DEFAULT NULL,
      `livraisons` TEXT DEFAULT NULL,
      `intervenants_presents` LONGTEXT DEFAULT NULL,
      `visiteurs` TEXT DEFAULT NULL,
      `incidents_securite` TEXT DEFAULT NULL,
      `retards` TEXT DEFAULT NULL,
      `decisions` TEXT DEFAULT NULL,
      `observations` TEXT DEFAULT NULL,
      `prochaine_date` DATE DEFAULT NULL,
      `prochaine_desc` TEXT DEFAULT NULL,
      `photos` LONGTEXT DEFAULT NULL,
      `valide_par` VARCHAR(120) DEFAULT NULL,
      `valide_at` DATETIME DEFAULT NULL,
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY `uq_chantier_date` (`chantier_id`, `date_jour`),
      KEY `idx_chantier` (`chantier_id`),
      KEY `idx_date` (`date_jour`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Phases/lots paramétrables pour journal
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_phases` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `nom` VARCHAR(120) NOT NULL,
      `ordre` INT NOT NULL DEFAULT 0,
      `actif` TINYINT(1) NOT NULL DEFAULT 1,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Migrate CA_chantier_phases — add lot_id, chantier_id, avancement columns if missing
    try {
        $cols = [];
        $colStmt = $db->query("SHOW COLUMNS FROM CA_chantier_phases");
        foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $c) { $cols[] = $c['Field']; }
        if (!in_array('lot_id', $cols)) {
            try { $db->exec("ALTER TABLE CA_chantier_phases ADD COLUMN `lot_id` VARCHAR(32) DEFAULT NULL AFTER `id`"); } catch (Exception $e) {}
            try { $db->exec("ALTER TABLE CA_chantier_phases ADD KEY `idx_phase_lot` (`lot_id`)"); } catch (Exception $e) {}
        }
        if (!in_array('chantier_id', $cols)) {
            try { $db->exec("ALTER TABLE CA_chantier_phases ADD COLUMN `chantier_id` VARCHAR(32) DEFAULT NULL AFTER `lot_id`"); } catch (Exception $e) {}
            try { $db->exec("ALTER TABLE CA_chantier_phases ADD KEY `idx_phase_chantier` (`chantier_id`)"); } catch (Exception $e) {}
        }
        if (!in_array('avancement', $cols)) {
            try { $db->exec("ALTER TABLE CA_chantier_phases ADD COLUMN `avancement` INT NOT NULL DEFAULT 0 AFTER `actif`"); } catch (Exception $e) {}
        }
    } catch (Exception $e) {}

    // Seed default phases if table empty
    try {
        $cnt = $db->query("SELECT COUNT(*) FROM CA_chantier_phases")->fetchColumn();
        if ($cnt == 0) {
            $phases = ['Terrassement','Fondations','Gros oeuvre','Charpente / Toiture','Etancheite','Maconnerie','Electricite','Plomberie','CVC / Climatisation','Menuiserie','Revetements sols','Revetements muraux','Peinture','Finitions','Amenagements exterieurs','VRD'];
            $ord = 1;
            foreach ($phases as $ph) {
                $pid = bin2hex(random_bytes(16));
                $db->prepare("INSERT INTO CA_chantier_phases (id, nom, ordre) VALUES (?,?,?)")->execute([$pid, $ph, $ord++]);
            }
        }
    } catch (Exception $e) {}

    // Migrate existing journal table — add new columns if missing
    try {
        $cols = [];
        $colStmt = $db->query("SHOW COLUMNS FROM CA_chantier_journal");
        foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $c) { $cols[] = $c['Field']; }
        $migrations = [
            ['numero',               "ADD COLUMN `numero` INT NOT NULL DEFAULT 1 AFTER `chantier_id`"],
            ['heure_debut',          "ADD COLUMN `heure_debut` VARCHAR(5) DEFAULT NULL AFTER `date_jour`"],
            ['heure_fin',            "ADD COLUMN `heure_fin` VARCHAR(5) DEFAULT NULL AFTER `heure_debut`"],
            ['phase_lot',            "ADD COLUMN `phase_lot` VARCHAR(120) DEFAULT NULL AFTER `heure_fin`"],
            ['intervenants_presents',"ADD COLUMN `intervenants_presents` LONGTEXT DEFAULT NULL AFTER `livraisons`"],
            ['incidents_securite',   "ADD COLUMN `incidents_securite` TEXT DEFAULT NULL AFTER `visiteurs`"],
            ['decisions',            "ADD COLUMN `decisions` TEXT DEFAULT NULL AFTER `retards`"],
            ['prochaine_date',       "ADD COLUMN `prochaine_date` DATE DEFAULT NULL AFTER `observations`"],
            ['prochaine_desc',       "ADD COLUMN `prochaine_desc` TEXT DEFAULT NULL AFTER `prochaine_date`"],
            ['photos',               "ADD COLUMN `photos` LONGTEXT DEFAULT NULL AFTER `prochaine_desc`"],
            ['valide_par',           "ADD COLUMN `valide_par` VARCHAR(120) DEFAULT NULL AFTER `photos`"],
            ['valide_at',            "ADD COLUMN `valide_at` DATETIME DEFAULT NULL AFTER `valide_par`"],
        ];
        foreach ($migrations as $m) {
            if (!in_array($m[0], $cols)) {
                try { $db->exec("ALTER TABLE CA_chantier_journal " . $m[1]); } catch (Exception $e) {}
            }
        }
    } catch (Exception $e) {
        // Table doesn't exist yet — CREATE TABLE above already has all columns, so no migration needed
    }

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_effectifs` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `journal_id` VARCHAR(32) NOT NULL,
      `chantier_id` VARCHAR(32) NOT NULL,
      `entreprise` VARCHAR(200) NOT NULL,
      `nb_ouvriers` INT NOT NULL DEFAULT 0,
      `nb_cadres` INT NOT NULL DEFAULT 0,
      `commentaire` VARCHAR(300) DEFAULT NULL,
      KEY `idx_journal` (`journal_id`),
      KEY `idx_chantier` (`chantier_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_intervenants` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `role` VARCHAR(80) NOT NULL,
      `nom` VARCHAR(200) NOT NULL,
      `societe` VARCHAR(200) DEFAULT NULL,
      `tel` VARCHAR(40) DEFAULT NULL,
      `email` VARCHAR(180) DEFAULT NULL,
      `responsabilites` TEXT DEFAULT NULL,
      `acces_portail` TINYINT(1) NOT NULL DEFAULT 0,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ── Lots-modèles (paramètres) ──
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_param_lots` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `nom` VARCHAR(200) NOT NULL,
      `code` VARCHAR(20) DEFAULT NULL,
      `ordre` INT NOT NULL DEFAULT 0,
      `actif` TINYINT(1) NOT NULL DEFAULT 1,
      `couleur` VARCHAR(9) DEFAULT '#c8a96e',
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ── Phases-modèles sous lots (paramètres) ──
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_param_lot_phases` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `param_lot_id` VARCHAR(32) NOT NULL,
      `nom` VARCHAR(200) NOT NULL,
      `ordre` INT NOT NULL DEFAULT 0,
      `actif` TINYINT(1) NOT NULL DEFAULT 1,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY `idx_param_lot` (`param_lot_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ── Phases réelles par lot dans un chantier ──
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_chantier_lot_phases` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `chantier_id` VARCHAR(32) NOT NULL,
      `lot_id` VARCHAR(32) NOT NULL,
      `nom` VARCHAR(200) NOT NULL,
      `avancement` INT NOT NULL DEFAULT 0,
      `ordre` INT NOT NULL DEFAULT 0,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_chantier` (`chantier_id`),
      KEY `idx_lot` (`lot_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Migrate CA_chantiers — add lot_depart, lot_fin columns if missing
    try {
        $cols = [];
        $colStmt = $db->query("SHOW COLUMNS FROM CA_chantiers");
        foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $c) { $cols[] = $c['Field']; }
        if (!in_array('lot_depart', $cols)) {
            try { $db->exec("ALTER TABLE CA_chantiers ADD COLUMN `lot_depart` VARCHAR(200) DEFAULT NULL AFTER `description`"); } catch (Exception $e) {}
        }
        if (!in_array('lot_fin', $cols)) {
            try { $db->exec("ALTER TABLE CA_chantiers ADD COLUMN `lot_fin` VARCHAR(200) DEFAULT NULL AFTER `lot_depart`"); } catch (Exception $e) {}
        }
    } catch (Exception $e) {}

    // Seed default param lots if table empty
    try {
        $cnt = $db->query("SELECT COUNT(*) FROM CA_param_lots")->fetchColumn();
        if ($cnt == 0) {
            $lots = ['Terrassement','Fondations','Gros oeuvre','Charpente / Toiture','Etancheite','Maconnerie','Electricite','Plomberie','CVC / Climatisation','Menuiserie','Revetements sols','Revetements muraux','Peinture','Finitions','Amenagements exterieurs','VRD'];
            $ord = 1;
            foreach ($lots as $ln) {
                $lid = bin2hex(random_bytes(16));
                $db->prepare("INSERT INTO CA_param_lots (id, nom, ordre) VALUES (?,?,?)")->execute([$lid, $ln, $ord++]);
                // Seed "Phase de départ" and "Phase de fin" for each lot
                $pid1 = bin2hex(random_bytes(16));
                $db->prepare("INSERT INTO CA_param_lot_phases (id, param_lot_id, nom, ordre) VALUES (?,?,?,?)")->execute([$pid1, $lid, 'Phase de départ', 1]);
                $pid2 = bin2hex(random_bytes(16));
                $db->prepare("INSERT INTO CA_param_lot_phases (id, param_lot_id, nom, ordre) VALUES (?,?,?,?)")->execute([$pid2, $lid, 'Phase de fin', 9999]);
            }
        }
    } catch (Exception $e) {}
}
try { ensureChantierTables(); } catch (\Throwable $e) { /* migration errors are non-fatal */ }

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
    // ── Phases (Paramètres) ──
    elseif ($action === 'phases') {
        if ($method === 'GET')            listPhases();
        elseif ($method === 'POST')       createPhase($user);
        elseif ($method === 'PUT')        updatePhase($id);
        elseif ($method === 'DELETE')     deletePhase($id);
    }
    // ── Param Lots (Paramètres — lots-modèles) ──
    elseif ($action === 'param_lots') {
        if ($method === 'GET')            listParamLots();
        elseif ($method === 'POST')       createParamLot($user);
        elseif ($method === 'PUT')        updateParamLot($id);
        elseif ($method === 'DELETE')     deleteParamLot($id);
    }
    // ── Param Lot Phases (Paramètres — phases sous lots-modèles) ──
    elseif ($action === 'param_lot_phases') {
        if ($method === 'GET')            listParamLotPhases();
        elseif ($method === 'POST')       createParamLotPhase($user);
        elseif ($method === 'PUT')        updateParamLotPhase($id);
        elseif ($method === 'DELETE')     deleteParamLotPhase($id);
    }
    // ── Lot Phases (phases réelles dans un chantier) ──
    elseif ($action === 'lot_phases') {
        if ($method === 'GET')            listLotPhases();
        elseif ($method === 'POST')       createLotPhase($user);
        elseif ($method === 'PUT')        updateLotPhase($id);
        elseif ($method === 'DELETE')     deleteLotPhase($id);
    }
    // ── Ajouter tous les lots-modèles à un chantier ──
    elseif ($action === 'add_all_lots') {
        if ($method === 'POST')           addAllLotsToChantier($user);
    }
    // ── Journal PDF export ──
    elseif ($action === 'journal_pdf') {
        exportJournalPDF($id);
    }
    // ── Valider journal ──
    elseif ($action === 'journal_valider') {
        validerJournal($id, $user);
    }
    // ── Dashboard ──
    elseif ($action === 'dashboard') {
        getDashboard();
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
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
                  date_debut, date_fin_prevue, statut, budget_travaux, description, lot_depart, lot_fin, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
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
           $b['lot_depart'] ?? null,
           $b['lot_fin'] ?? null,
           $user['name'] ?? ''
       ]);

    // Auto-create "Phase de départ" and "Phase de fin" for the new chantier
    $phDepart = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_phases (id, chantier_id, nom, ordre, actif, avancement) VALUES (?,?,?,?,?,?)")
       ->execute([$phDepart, $id, 'Phase de départ', 1, 1, 0]);
    $phFin = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_phases (id, chantier_id, nom, ordre, actif, avancement) VALUES (?,?,?,?,?,?)")
       ->execute([$phFin, $id, 'Phase de fin', 9999, 1, 0]);

    jsonOk(['id' => $id]);
}

function updateChantier($id, $user) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantiers SET
                  projet_id=?, nom=?, code=?, adresse=?, lat=?, lng=?,
                  date_debut=?, date_fin_prevue=?, date_fin_reelle=?,
                  statut=?, avancement_global=?, budget_travaux=?, montant_engage=?,
                  description=?, lot_depart=?, lot_fin=?
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
           $b['lot_depart'] ?? null,
           $b['lot_fin'] ?? null,
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
    $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Attach phases for each lot
    $phStmt = $db->prepare("SELECT * FROM CA_chantier_phases WHERE lot_id=? ORDER BY ordre ASC, nom ASC");
    foreach ($lots as &$lot) {
        $phStmt->execute([$lot['id']]);
        $lot['phases'] = $phStmt->fetchAll(PDO::FETCH_ASSOC);
    }
    unset($lot);

    jsonOk($lots);
}

function createLot($user) {
    $b = getBody();
    $db = getDB();
    // Check for duplicate lot name in same chantier
    $dup = $db->prepare("SELECT id FROM CA_chantier_lots WHERE chantier_id=? AND nom=?");
    $dup->execute([$b['chantier_id']??'', $b['nom']??'']);
    if ($dup->fetch()) { jsonError('Attention : lot déjà existant', 409); return; }

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
    // Also delete phases attached to this lot
    $db->prepare("DELETE FROM CA_chantier_phases WHERE lot_id=?")->execute([$id]);
    $db->prepare("DELETE FROM CA_chantier_lots WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  JOURNAL QUOTIDIEN
// ══════════════════════════════════════

function listJournal() {
    $db = getDB();
    $cid = $_GET['chantier_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';
    $phase = $_GET['phase'] ?? '';
    $sql = "SELECT * FROM CA_chantier_journal WHERE chantier_id=?";
    $params = [$cid];
    if ($dateFrom) { $sql .= " AND date_jour >= ?"; $params[] = $dateFrom; }
    if ($dateTo)   { $sql .= " AND date_jour <= ?"; $params[] = $dateTo; }
    if ($phase)    { $sql .= " AND phase_lot = ?";  $params[] = $phase; }
    $sql .= " ORDER BY date_jour DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Attach effectifs + decode JSON fields safely
    foreach ($rows as &$r) {
        $s2 = $db->prepare("SELECT * FROM CA_chantier_effectifs WHERE journal_id=?");
        $s2->execute([$r['id']]);
        $r['effectifs'] = $s2->fetchAll(PDO::FETCH_ASSOC);
        if (isset($r['intervenants_presents'])) {
            $r['intervenants_presents'] = json_decode($r['intervenants_presents'] ?: '[]', true) ?: [];
        } else { $r['intervenants_presents'] = []; }
        if (isset($r['photos'])) {
            $r['photos'] = json_decode($r['photos'] ?: '[]', true) ?: [];
        } else { $r['photos'] = []; }
        if (!isset($r['numero'])) $r['numero'] = 0;
        if (!isset($r['heure_debut'])) $r['heure_debut'] = null;
        if (!isset($r['heure_fin'])) $r['heure_fin'] = null;
        if (!isset($r['phase_lot'])) $r['phase_lot'] = null;
        if (!isset($r['incidents_securite'])) $r['incidents_securite'] = null;
        if (!isset($r['decisions'])) $r['decisions'] = null;
        if (!isset($r['prochaine_date'])) $r['prochaine_date'] = null;
        if (!isset($r['prochaine_desc'])) $r['prochaine_desc'] = null;
        if (!isset($r['valide_par'])) $r['valide_par'] = null;
    }
    jsonOk($rows);
}

function createJournal($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $cid = $b['chantier_id'] ?? '';
    // Auto-numérotation
    $num = 1;
    try {
        $s = $db->prepare("SELECT COALESCE(MAX(numero),0)+1 AS next_num FROM CA_chantier_journal WHERE chantier_id=?");
        $s->execute([$cid]);
        $num = $s->fetch(PDO::FETCH_ASSOC)['next_num'] ?: 1;
    } catch (Exception $e) {
        // numero column may not exist yet in migration edge case
        $s2 = $db->prepare("SELECT COUNT(*)+1 AS next_num FROM CA_chantier_journal WHERE chantier_id=?");
        $s2->execute([$cid]);
        $num = $s2->fetch(PDO::FETCH_ASSOC)['next_num'];
    }

    $db->prepare("INSERT INTO CA_chantier_journal (id, chantier_id, numero, date_jour, heure_debut, heure_fin,
                  phase_lot, meteo, temperature, effectif_total, activites, livraisons,
                  intervenants_presents, visiteurs, incidents_securite, retards, decisions,
                  observations, prochaine_date, prochaine_desc, photos, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([$id, $cid, $num, $b['date_jour']??date('Y-m-d'),
                  $b['heure_debut']??null, $b['heure_fin']??null,
                  $b['phase_lot']??null, $b['meteo']??null, $b['temperature']??null,
                  $b['effectif_total']??0, $b['activites']??null, $b['livraisons']??null,
                  json_encode($b['intervenants_presents']??[], JSON_UNESCAPED_UNICODE),
                  $b['visiteurs']??null, $b['incidents_securite']??null,
                  $b['retards']??null, $b['decisions']??null,
                  $b['observations']??null, $b['prochaine_date']??null, $b['prochaine_desc']??null,
                  json_encode($b['photos']??[], JSON_UNESCAPED_UNICODE),
                  $user['name']??'']);
    // Save effectifs
    if (!empty($b['effectifs']) && is_array($b['effectifs'])) {
        foreach ($b['effectifs'] as $eff) {
            $eid = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_effectifs (id, journal_id, chantier_id, entreprise, nb_ouvriers, nb_cadres, commentaire)
                          VALUES (?,?,?,?,?,?,?)")
               ->execute([$eid, $id, $cid, $eff['entreprise']??'',
                          $eff['nb_ouvriers']??0, $eff['nb_cadres']??0, $eff['commentaire']??null]);
        }
    }
    jsonOk(['id' => $id, 'numero' => $num]);
}

function updateJournal($id, $user) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_journal SET date_jour=?, heure_debut=?, heure_fin=?,
                  phase_lot=?, meteo=?, temperature=?, effectif_total=?, activites=?, livraisons=?,
                  intervenants_presents=?, visiteurs=?, incidents_securite=?, retards=?, decisions=?,
                  observations=?, prochaine_date=?, prochaine_desc=?, photos=?
                  WHERE id=?")
       ->execute([$b['date_jour']??date('Y-m-d'), $b['heure_debut']??null, $b['heure_fin']??null,
                  $b['phase_lot']??null, $b['meteo']??null, $b['temperature']??null,
                  $b['effectif_total']??0, $b['activites']??null, $b['livraisons']??null,
                  json_encode($b['intervenants_presents']??[], JSON_UNESCAPED_UNICODE),
                  $b['visiteurs']??null, $b['incidents_securite']??null,
                  $b['retards']??null, $b['decisions']??null,
                  $b['observations']??null, $b['prochaine_date']??null, $b['prochaine_desc']??null,
                  json_encode($b['photos']??[], JSON_UNESCAPED_UNICODE), $id]);
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

function validerJournal($id, $user) {
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_journal SET valide_par=?, valide_at=NOW() WHERE id=?")
       ->execute([$user['name']??'', $id]);
    jsonOk(['validated' => true]);
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
//  PHASES (Parametres chantier)
// ══════════════════════════════════════

function listPhases() {
    $db = getDB();
    $rows = $db->query("SELECT * FROM CA_chantier_phases ORDER BY ordre ASC, nom ASC")->fetchAll(PDO::FETCH_ASSOC);
    jsonOk($rows);
}

function createPhase($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $maxOrd = $db->query("SELECT COALESCE(MAX(ordre),0)+1 FROM CA_chantier_phases")->fetchColumn();
    $db->prepare("INSERT INTO CA_chantier_phases (id, nom, ordre, actif) VALUES (?,?,?,?)")
       ->execute([$id, $b['nom']??'', $maxOrd, $b['actif']??1]);
    jsonOk(['id' => $id]);
}

function updatePhase($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_phases SET nom=?, ordre=?, actif=? WHERE id=?")
       ->execute([$b['nom']??'', $b['ordre']??0, $b['actif']??1, $id]);
    jsonOk(['updated' => true]);
}

function deletePhase($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_phases WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  JOURNAL PDF EXPORT
// ══════════════════════════════════════

function exportJournalPDF($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT j.*, c.nom AS chantier_nom, c.code AS chantier_code, c.adresse AS chantier_adresse,
                          p.nom AS projet_nom, p.code AS projet_code
                          FROM CA_chantier_journal j
                          LEFT JOIN CA_chantiers c ON c.id = j.chantier_id
                          LEFT JOIN CA_projets p ON p.id = c.projet_id
                          WHERE j.id=?");
    $stmt->execute([$id]);
    $j = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$j) jsonError('Journal introuvable', 404);

    $j['intervenants_presents'] = json_decode($j['intervenants_presents'] ?: '[]', true);
    $j['photos'] = json_decode($j['photos'] ?: '[]', true);

    $s2 = $db->prepare("SELECT * FROM CA_chantier_effectifs WHERE journal_id=?");
    $s2->execute([$id]);
    $j['effectifs'] = $s2->fetchAll(PDO::FETCH_ASSOC);

    $agence = [];
    try {
        $sa = $db->query("SELECT cle, valeur FROM CA_params WHERE cle LIKE 'agence_%'");
        foreach ($sa->fetchAll(PDO::FETCH_ASSOC) as $r) { $agence[$r['cle']] = $r['valeur']; }
    } catch (Exception $e) {}

    jsonOk(['journal' => $j, 'agence' => $agence]);
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

    // Reserves stats (table in chantier_reserves.php — may not exist yet)
    $data['reserves_stats'] = [];
    try {
        $s2 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_reserves WHERE chantier_id=? GROUP BY statut");
        $s2->execute([$cid]);
        $data['reserves_stats'] = $s2->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    // RFI stats
    $data['rfi_stats'] = [];
    try {
        $s3 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_rfi WHERE chantier_id=? GROUP BY statut");
        $s3->execute([$cid]);
        $data['rfi_stats'] = $s3->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    // Visa stats
    $data['visa_stats'] = [];
    try {
        $s4 = $db->prepare("SELECT statut, COUNT(*) as nb FROM CA_chantier_visas WHERE chantier_id=? GROUP BY statut");
        $s4->execute([$cid]);
        $data['visa_stats'] = $s4->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    // Incidents stats
    $data['incidents_stats'] = [];
    try {
        $s5 = $db->prepare("SELECT type, COUNT(*) as nb FROM CA_chantier_incidents WHERE chantier_id=? GROUP BY type");
        $s5->execute([$cid]);
        $data['incidents_stats'] = $s5->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    // Recent journal
    $data['recent_journal'] = [];
    try {
        $s6 = $db->prepare("SELECT * FROM CA_chantier_journal WHERE chantier_id=? ORDER BY date_jour DESC LIMIT 5");
        $s6->execute([$cid]);
        $data['recent_journal'] = $s6->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    // Open actions
    $data['actions_ouvertes'] = 0;
    try {
        $s7 = $db->prepare("SELECT COUNT(*) as nb FROM CA_chantier_reunion_actions WHERE chantier_id=? AND statut != 'Clôturée'");
        $s7->execute([$cid]);
        $data['actions_ouvertes'] = $s7->fetch(PDO::FETCH_ASSOC)['nb'];
    } catch (Exception $e) {}

    jsonOk($data);
}

// ══════════════════════════════════════
//  PARAM LOTS (lots-modèles dans paramètres)
// ══════════════════════════════════════

function listParamLots() {
    $db = getDB();
    $rows = $db->query("SELECT * FROM CA_param_lots ORDER BY ordre ASC, nom ASC")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $sp = $db->prepare("SELECT * FROM CA_param_lot_phases WHERE param_lot_id=? ORDER BY ordre ASC, cree_at ASC");
        $sp->execute([$row['id']]);
        $row['phases'] = $sp->fetchAll(PDO::FETCH_ASSOC);
    }
    jsonOk($rows);
}

function createParamLot($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $maxOrd = $db->query("SELECT COALESCE(MAX(ordre),0)+1 FROM CA_param_lots")->fetchColumn();
    $db->prepare("INSERT INTO CA_param_lots (id, nom, code, ordre, actif, couleur) VALUES (?,?,?,?,?,?)")
       ->execute([$id, $b['nom']??'', $b['code']??null, $maxOrd, $b['actif']??1, $b['couleur']??'#c8a96e']);
    // Auto-create "Phase de départ" and "Phase de fin"
    $pid1 = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_param_lot_phases (id, param_lot_id, nom, ordre) VALUES (?,?,?,?)")
       ->execute([$pid1, $id, 'Phase de départ', 1]);
    $pid2 = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_param_lot_phases (id, param_lot_id, nom, ordre) VALUES (?,?,?,?)")
       ->execute([$pid2, $id, 'Phase de fin', 9999]);
    jsonOk(['id' => $id]);
}

function updateParamLot($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_param_lots SET nom=?, code=?, ordre=?, actif=?, couleur=? WHERE id=?")
       ->execute([$b['nom']??'', $b['code']??null, $b['ordre']??0, $b['actif']??1, $b['couleur']??'#c8a96e', $id]);
    jsonOk(['updated' => true]);
}

function deleteParamLot($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_param_lot_phases WHERE param_lot_id=?")->execute([$id]);
    $db->prepare("DELETE FROM CA_param_lots WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  PARAM LOT PHASES (phases-modèles sous lots)
// ══════════════════════════════════════

function listParamLotPhases() {
    $db = getDB();
    $lotId = $_GET['param_lot_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CA_param_lot_phases WHERE param_lot_id=? ORDER BY ordre ASC, cree_at ASC");
    $stmt->execute([$lotId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createParamLotPhase($user) {
    $b = getBody();
    $db = getDB();
    $id = bin2hex(random_bytes(16));
    $maxOrd = $db->prepare("SELECT COALESCE(MAX(ordre),0)+1 FROM CA_param_lot_phases WHERE param_lot_id=?");
    $maxOrd->execute([$b['param_lot_id']??'']);
    $ord = $maxOrd->fetchColumn();
    // Insert before "Phase de fin" (ordre 9999)
    if ($ord >= 9999) $ord = 9998;
    $db->prepare("INSERT INTO CA_param_lot_phases (id, param_lot_id, nom, ordre, actif) VALUES (?,?,?,?,?)")
       ->execute([$id, $b['param_lot_id']??'', $b['nom']??'', $ord, $b['actif']??1]);
    jsonOk(['id' => $id]);
}

function updateParamLotPhase($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_param_lot_phases SET nom=?, ordre=?, actif=? WHERE id=?")
       ->execute([$b['nom']??'', $b['ordre']??0, $b['actif']??1, $id]);
    jsonOk(['updated' => true]);
}

function deleteParamLotPhase($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_param_lot_phases WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  LOT PHASES (phases réelles par lot dans chantier)
// ══════════════════════════════════════

function listLotPhases() {
    $db = getDB();
    $lotId = $_GET['lot_id'] ?? '';
    $stmt = $db->prepare("SELECT * FROM CA_chantier_lot_phases WHERE lot_id=? ORDER BY ordre ASC, cree_at ASC");
    $stmt->execute([$lotId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createLotPhase($user) {
    $b = getBody();
    $db = getDB();
    // Check for duplicate phase name in same lot
    $dup = $db->prepare("SELECT id FROM CA_chantier_lot_phases WHERE lot_id=? AND nom=?");
    $dup->execute([$b['lot_id']??'', $b['nom']??'']);
    if ($dup->fetch()) { jsonError('Attention : phase déjà existante dans ce lot', 409); return; }

    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_chantier_lot_phases (id, chantier_id, lot_id, nom, avancement, ordre) VALUES (?,?,?,?,?,?)")
       ->execute([$id, $b['chantier_id']??'', $b['lot_id']??'', $b['nom']??'', $b['avancement']??0, $b['ordre']??0]);
    jsonOk(['id' => $id]);
}

function updateLotPhase($id) {
    $b = getBody();
    $db = getDB();
    $db->prepare("UPDATE CA_chantier_lot_phases SET nom=?, avancement=?, ordre=? WHERE id=?")
       ->execute([$b['nom']??'', $b['avancement']??0, $b['ordre']??0, $id]);
    // Recalculate lot avancement = average of its phases
    $lotId = $b['lot_id'] ?? '';
    if ($lotId) {
        $avg = $db->prepare("SELECT ROUND(AVG(avancement)) FROM CA_chantier_lot_phases WHERE lot_id=?");
        $avg->execute([$lotId]);
        $newAvg = (int)$avg->fetchColumn();
        $db->prepare("UPDATE CA_chantier_lots SET avancement=? WHERE id=?")->execute([$newAvg, $lotId]);
    }
    jsonOk(['updated' => true]);
}

function deleteLotPhase($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_chantier_lot_phases WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ══════════════════════════════════════
//  ADD ALL LOTS (copier lots-modèles → chantier)
// ══════════════════════════════════════

function addAllLotsToChantier($user) {
    $b = getBody();
    $db = getDB();
    $chantierId = $b['chantier_id'] ?? '';
    if (!$chantierId) jsonError('chantier_id requis', 400);

    // Get chantier dates for lot defaults
    $ch = $db->prepare("SELECT date_debut, date_fin_prevue FROM CA_chantiers WHERE id=?");
    $ch->execute([$chantierId]);
    $chData = $ch->fetch(PDO::FETCH_ASSOC);

    // Get all active param lots
    $stmt = $db->query("SELECT * FROM CA_param_lots WHERE actif=1 ORDER BY ordre ASC");
    $paramLots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $created = 0;
    foreach ($paramLots as $pl) {
        $lotId = bin2hex(random_bytes(16));
        $db->prepare("INSERT INTO CA_chantier_lots (id, chantier_id, code, nom, entreprise, montant_marche, date_debut, date_fin_prevue, ordre, couleur)
                      VALUES (?,?,?,?,?,?,?,?,?,?)")
           ->execute([
               $lotId, $chantierId, $pl['code'], $pl['nom'], null, 0,
               $chData['date_debut'] ?? null, $chData['date_fin_prevue'] ?? null,
               $pl['ordre'], $pl['couleur']
           ]);

        // Copy phases from param lot
        $sp = $db->prepare("SELECT * FROM CA_param_lot_phases WHERE param_lot_id=? AND actif=1 ORDER BY ordre ASC");
        $sp->execute([$pl['id']]);
        $paramPhases = $sp->fetchAll(PDO::FETCH_ASSOC);

        foreach ($paramPhases as $pp) {
            $phaseId = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_chantier_lot_phases (id, chantier_id, lot_id, nom, avancement, ordre) VALUES (?,?,?,?,?,?)")
               ->execute([$phaseId, $chantierId, $lotId, $pp['nom'], 0, $pp['ordre']]);
        }
        $created++;
    }
    jsonOk(['created' => $created]);
}
