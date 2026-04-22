<?php
// ============================================================
//  CORTOBA ATELIER — API Honoraires (Suivi des honoraires)
//  Barème MOP, décomposition par mission, valeur acquise
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// ── Runtime migrations ──
function ensureHonorairesSchema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_honoraires_grille` (
      `id` int unsigned NOT NULL AUTO_INCREMENT,
      `tranche_min` decimal(14,2) NOT NULL DEFAULT 0,
      `tranche_max` decimal(14,2) DEFAULT NULL,
      `taux_global` decimal(5,3) NOT NULL,
      `esquisse_pct` decimal(5,2) NOT NULL DEFAULT 5.00,
      `aps_pct` decimal(5,2) NOT NULL DEFAULT 15.00,
      `apd_pct` decimal(5,2) NOT NULL DEFAULT 20.00,
      `pro_dce_pct` decimal(5,2) NOT NULL DEFAULT 20.00,
      `suivi_det_pct` decimal(5,2) NOT NULL DEFAULT 30.00,
      `aor_pct` decimal(5,2) NOT NULL DEFAULT 10.00,
      `actif` tinyint(1) NOT NULL DEFAULT 1,
      `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `tranche` (`tranche_min`, `tranche_max`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_projets_honoraires` (
      `id` int unsigned NOT NULL AUTO_INCREMENT,
      `projet_id` varchar(32) NOT NULL,
      `mission_phase` varchar(30) NOT NULL,
      `mission_label` varchar(150) DEFAULT NULL,
      `mode` enum('mop','custom') NOT NULL DEFAULT 'mop',
      `taux_pct` decimal(5,2) DEFAULT NULL,
      `montant_prevu` decimal(14,2) NOT NULL DEFAULT 0,
      `montant_engage` decimal(14,2) NOT NULL DEFAULT 0,
      `montant_facture` decimal(14,2) NOT NULL DEFAULT 0,
      `montant_encaisse` decimal(14,2) NOT NULL DEFAULT 0,
      `progression_prevue` int NOT NULL DEFAULT 0,
      `progression_reelle` int NOT NULL DEFAULT 0,
      `date_debut_prevue` date DEFAULT NULL,
      `date_fin_prevue` date DEFAULT NULL,
      `date_debut_reelle` date DEFAULT NULL,
      `date_fin_reelle` date DEFAULT NULL,
      `ordre` int NOT NULL DEFAULT 0,
      `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `projet_mission` (`projet_id`, `mission_phase`),
      KEY `projet_id` (`projet_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ALTER CDS_projets — add fee tracking columns
    $alters = [
        "ADD COLUMN IF NOT EXISTS `honoraires_mode` varchar(10) DEFAULT 'mop'",
        "ADD COLUMN IF NOT EXISTS `honoraires_prevus` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `honoraires_engages` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `honoraires_factures` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `honoraires_encaisses` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `alerte_budget` varchar(20) DEFAULT NULL",
    ];
    foreach ($alters as $a) {
        try { $db->exec("ALTER TABLE CDS_projets $a"); } catch (\Throwable $e) {}
    }

    // ALTER CDS_factures — add mission_phase, montant_paye
    $fa = [
        "ADD COLUMN IF NOT EXISTS `montant_paye` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `relance_niveau` tinyint DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `derniere_relance` datetime DEFAULT NULL",
        "ADD COLUMN IF NOT EXISTS `mission_phase` varchar(30) DEFAULT NULL",
    ];
    foreach ($fa as $a) {
        try { $db->exec("ALTER TABLE CDS_factures $a"); } catch (\Throwable $e) {}
    }

    // Seed default MOP brackets if table is empty
    $count = (int)$db->query("SELECT COUNT(*) FROM CDS_honoraires_grille")->fetchColumn();
    if ($count === 0) {
        $db->exec("INSERT INTO CDS_honoraires_grille (tranche_min, tranche_max, taux_global) VALUES
            (0, 100000, 8.000),
            (100000, 500000, 6.000),
            (500000, 1000000, 5.000),
            (1000000, 5000000, 4.000),
            (5000000, NULL, 3.000)");
    }

    $done = true;
}

// ── MOP labels ──
function getMOPPhases() {
    return [
        ['phase' => 'esquisse',  'label' => 'Esquisse',           'pct_col' => 'esquisse_pct',  'ordre' => 1],
        ['phase' => 'aps',       'label' => 'Avant-Projet Sommaire (APS)', 'pct_col' => 'aps_pct',       'ordre' => 2],
        ['phase' => 'apd',       'label' => 'Avant-Projet Détaillé (APD)', 'pct_col' => 'apd_pct',       'ordre' => 3],
        ['phase' => 'pro_dce',   'label' => 'Projet / DCE',       'pct_col' => 'pro_dce_pct',   'ordre' => 4],
        ['phase' => 'suivi_det', 'label' => 'Suivi chantier / DET','pct_col' => 'suivi_det_pct', 'ordre' => 5],
        ['phase' => 'aor',       'label' => 'Réception (AOR)',    'pct_col' => 'aor_pct',       'ordre' => 6],
    ];
}

// ── Calcul MOP ──
function calculMOP($coutConstruction) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CDS_honoraires_grille WHERE actif = 1 AND tranche_min <= ? AND (tranche_max IS NULL OR tranche_max > ?) ORDER BY tranche_min ASC LIMIT 1");
    $stmt->execute([$coutConstruction, $coutConstruction]);
    $grille = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$grille) return null;

    $totalHonoraires = $coutConstruction * $grille['taux_global'] / 100;
    $phases = getMOPPhases();
    $result = [
        'cout_construction' => (float)$coutConstruction,
        'taux_global' => (float)$grille['taux_global'],
        'total_honoraires' => round($totalHonoraires, 2),
        'tranche' => $grille,
        'phases' => [],
    ];
    foreach ($phases as $p) {
        $pct = (float)$grille[$p['pct_col']];
        $montant = round($totalHonoraires * $pct / 100, 2);
        $result['phases'][] = [
            'phase' => $p['phase'],
            'label' => $p['label'],
            'pct' => $pct,
            'montant' => $montant,
            'ordre' => $p['ordre'],
        ];
    }
    return $result;
}

// ── Refresh projet honoraires aggregates ──
function refreshProjetHonoraires($projetId) {
    $db = getDB();

    // Get all phases for this project
    $stmt = $db->prepare("SELECT * FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
    $stmt->execute([$projetId]);
    $phases = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    if (!$phases) return;

    $totalPrevu = 0; $totalEngage = 0; $totalFacture = 0; $totalEncaisse = 0;

    foreach ($phases as $ph) {
        $missionPhase = $ph['mission_phase'];

        // Facturé: sum of invoices linked to this project + mission_phase
        $s = $db->prepare("SELECT COALESCE(SUM(COALESCE(net_payer, montant_ttc, 0)),0) FROM CDS_factures WHERE projet_id = ? AND mission_phase = ? AND statut != 'Annulée'");
        $s->execute([$projetId, $missionPhase]);
        $facture = (float)$s->fetchColumn();

        // Encaissé: sum of payments for invoices of this project + mission_phase
        $s = $db->prepare("SELECT COALESCE(SUM(p.montant),0) FROM CDS_paiements p JOIN CDS_factures f ON f.id COLLATE utf8mb4_unicode_ci = p.facture_id COLLATE utf8mb4_unicode_ci WHERE f.projet_id = ? AND f.mission_phase = ?");
        $s->execute([$projetId, $missionPhase]);
        $encaisse = (float)$s->fetchColumn();

        // Engagé: sum of accepted devis for this project
        // Note: devis don't have mission_phase, so we use total per project divided proportionally
        // We'll calculate project-level engagé below

        $db->prepare("UPDATE CDS_projets_honoraires SET montant_facture = ?, montant_encaisse = ?, modifie_at = NOW() WHERE projet_id = ? AND mission_phase = ?")
           ->execute([$facture, $encaisse, $projetId, $missionPhase]);

        $totalPrevu += (float)$ph['montant_prevu'];
        $totalFacture += $facture;
        $totalEncaisse += $encaisse;
    }

    // Engagé = sum of accepted devis for this project
    $s = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CDS_devis WHERE projet_id = ? AND statut = 'Accepté'");
    $s->execute([$projetId]);
    $totalEngage = (float)$s->fetchColumn();

    // Determine alert level
    $alertLevel = null;
    if ($totalPrevu > 0) {
        $ratio = ($totalFacture / $totalPrevu) * 100;
        // Load thresholds from settings
        $s = $db->prepare("SELECT valeur FROM CDS_parametres WHERE cle = 'alert_thresholds'");
        $s->execute();
        $thresholds = json_decode($s->fetchColumn() ?: '{}', true);
        $warning = $thresholds['warning'] ?? 80;
        $danger = $thresholds['danger'] ?? 90;
        $critical = $thresholds['critical'] ?? 100;

        if ($ratio >= $critical) $alertLevel = 'red';
        elseif ($ratio >= $danger) $alertLevel = 'orange';
        elseif ($ratio >= $warning) $alertLevel = 'yellow';
        else $alertLevel = 'green';
    }

    // Update project summary
    $db->prepare("UPDATE CDS_projets SET honoraires_prevus = ?, honoraires_engages = ?, honoraires_factures = ?, honoraires_encaisses = ?, alerte_budget = ? WHERE id = ?")
       ->execute([$totalPrevu, $totalEngage, $totalFacture, $totalEncaisse, $alertLevel, $projetId]);
}

// ── Main handler ──
// Ne s'exécute QUE si le script est appelé directement (pas via require_once d'un autre fichier)
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'honoraires.php') {

setCorsHeaders();
ensureHonorairesSchema();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'grille':
            if ($method === 'GET') getGrille();
            else jsonError('GET requis', 405);
            break;
        case 'grille_save':
            $user = requireAuth();
            if ($method === 'POST') saveGrille($user);
            else jsonError('POST requis', 405);
            break;
        case 'calcul_mop':
            requireAuth();
            if ($method === 'GET') doCalculMOP();
            else jsonError('GET requis', 405);
            break;
        case 'projet':
            requireAuth();
            if ($method === 'GET') getProjetHonoraires();
            else jsonError('GET requis', 405);
            break;
        case 'projet_init':
            $user = requireAuth();
            if ($method === 'POST') initProjetHonoraires($user);
            else jsonError('POST requis', 405);
            break;
        case 'projet_update':
            $user = requireAuth();
            if ($method === 'PUT') updateProjetPhase($user);
            else jsonError('PUT requis', 405);
            break;
        case 'projet_refresh':
            requireAuth();
            if ($method === 'POST') doRefreshProjet();
            else jsonError('POST requis', 405);
            break;
        case 'valeur_acquise':
            requireAuth();
            if ($method === 'GET') getValeurAcquise();
            else jsonError('GET requis', 405);
            break;
        case 'dashboard':
            requireAuth();
            if ($method === 'GET') getDashboardHonoraires();
            else jsonError('GET requis', 405);
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

} // fin du guard basename === 'honoraires.php'

// ── Actions ──

function getGrille() {
    $db = getDB();
    $rows = $db->query("SELECT * FROM CDS_honoraires_grille WHERE actif = 1 ORDER BY tranche_min ASC")->fetchAll(\PDO::FETCH_ASSOC);
    $phases = getMOPPhases();
    jsonOk(['grille' => $rows, 'phases' => $phases]);
}

function saveGrille($user) {
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') {
        jsonError('Accès réservé aux administrateurs', 403);
    }
    $body = getBody();
    $rows = $body['grille'] ?? [];
    if (empty($rows)) jsonError('Données grille requises');

    $db = getDB();
    $db->beginTransaction();
    try {
        // Deactivate existing
        $db->exec("UPDATE CDS_honoraires_grille SET actif = 0");

        $stmt = $db->prepare("INSERT INTO CDS_honoraires_grille (tranche_min, tranche_max, taux_global, esquisse_pct, aps_pct, apd_pct, pro_dce_pct, suivi_det_pct, aor_pct, actif) VALUES (?,?,?,?,?,?,?,?,?,1)");
        foreach ($rows as $r) {
            $stmt->execute([
                $r['tranche_min'] ?? 0,
                $r['tranche_max'] ?? null,
                $r['taux_global'] ?? 0,
                $r['esquisse_pct'] ?? 5,
                $r['aps_pct'] ?? 15,
                $r['apd_pct'] ?? 20,
                $r['pro_dce_pct'] ?? 20,
                $r['suivi_det_pct'] ?? 30,
                $r['aor_pct'] ?? 10,
            ]);
        }
        $db->commit();
        jsonOk(['saved' => count($rows)]);
    } catch (\Throwable $e) {
        $db->rollBack();
        jsonError('Erreur sauvegarde: ' . $e->getMessage(), 500);
    }
}

function doCalculMOP() {
    $cout = (float)($_GET['cout_construction'] ?? 0);
    if ($cout <= 0) jsonError('cout_construction requis et > 0');
    $result = calculMOP($cout);
    if (!$result) jsonError('Aucune tranche trouvée pour ce montant');
    jsonOk($result);
}

function getProjetHonoraires() {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');

    $db = getDB();

    // Project info
    $s = $db->prepare("SELECT id, code, nom, cout_construction, honoraires, honoraires_mode, honoraires_prevus, honoraires_engages, honoraires_factures, honoraires_encaisses, alerte_budget FROM CDS_projets WHERE id = ?");
    $s->execute([$projetId]);
    $projet = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    // Phases
    $s = $db->prepare("SELECT * FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
    $s->execute([$projetId]);
    $phases = $s->fetchAll(\PDO::FETCH_ASSOC);

    jsonOk(['projet' => $projet, 'phases' => $phases]);
}

function initProjetHonoraires($user) {
    $body = getBody();
    $projetId = $body['projet_id'] ?? '';
    $mode = $body['mode'] ?? 'mop';
    if (!$projetId) jsonError('projet_id requis');

    $db = getDB();

    // Get project
    $s = $db->prepare("SELECT id, cout_construction, honoraires FROM CDS_projets WHERE id = ?");
    $s->execute([$projetId]);
    $projet = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    // Delete existing
    $db->prepare("DELETE FROM CDS_projets_honoraires WHERE projet_id = ?")->execute([$projetId]);

    if ($mode === 'mop') {
        $cout = (float)$projet['cout_construction'];
        if ($cout <= 0) jsonError('Le projet doit avoir un coût de construction pour le mode MOP');

        $calcul = calculMOP($cout);
        if (!$calcul) jsonError('Aucune tranche MOP trouvée');

        $stmt = $db->prepare("INSERT INTO CDS_projets_honoraires (projet_id, mission_phase, mission_label, mode, taux_pct, montant_prevu, ordre) VALUES (?,?,?,?,?,?,?)");
        foreach ($calcul['phases'] as $p) {
            $stmt->execute([$projetId, $p['phase'], $p['label'], 'mop', $p['pct'], $p['montant'], $p['ordre']]);
        }

        // Update project
        $db->prepare("UPDATE CDS_projets SET honoraires_mode = 'mop', honoraires = ?, honoraires_prevus = ? WHERE id = ?")
           ->execute([$calcul['total_honoraires'], $calcul['total_honoraires'], $projetId]);

    } else {
        // Custom mode: user provides phases
        $phases = $body['phases'] ?? [];
        if (empty($phases)) jsonError('phases requises en mode custom');

        $totalPrevu = 0;
        $stmt = $db->prepare("INSERT INTO CDS_projets_honoraires (projet_id, mission_phase, mission_label, mode, taux_pct, montant_prevu, ordre) VALUES (?,?,?,'custom',?,?,?)");
        foreach ($phases as $i => $p) {
            $montant = (float)($p['montant_prevu'] ?? 0);
            $stmt->execute([
                $projetId,
                $p['mission_phase'] ?? 'custom_' . $i,
                $p['mission_label'] ?? 'Phase ' . ($i + 1),
                $p['taux_pct'] ?? null,
                $montant,
                $p['ordre'] ?? ($i + 1),
            ]);
            $totalPrevu += $montant;
        }

        $db->prepare("UPDATE CDS_projets SET honoraires_mode = 'custom', honoraires = ?, honoraires_prevus = ? WHERE id = ?")
           ->execute([$totalPrevu, $totalPrevu, $projetId]);
    }

    refreshProjetHonoraires($projetId);

    // Return updated data
    $s = $db->prepare("SELECT * FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
    $s->execute([$projetId]);
    jsonOk(['phases' => $s->fetchAll(\PDO::FETCH_ASSOC), 'mode' => $mode]);
}

function updateProjetPhase($user) {
    $body = getBody();
    $id = $_GET['id'] ?? ($body['id'] ?? '');
    if (!$id) jsonError('id requis');

    $db = getDB();
    $fields = ['mission_label', 'mode', 'taux_pct', 'montant_prevu', 'progression_prevue', 'progression_reelle',
               'date_debut_prevue', 'date_fin_prevue', 'date_debut_reelle', 'date_fin_reelle'];

    $sets = []; $vals = [];
    foreach ($fields as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "`$f` = ?";
            $vals[] = $body[$f];
        }
    }
    if (empty($sets)) jsonError('Aucun champ à mettre à jour');

    $vals[] = $id;
    $db->prepare("UPDATE CDS_projets_honoraires SET " . implode(',', $sets) . " WHERE id = ?")->execute($vals);

    // Get projet_id to refresh
    $s = $db->prepare("SELECT projet_id FROM CDS_projets_honoraires WHERE id = ?");
    $s->execute([$id]);
    $projetId = $s->fetchColumn();
    if ($projetId) refreshProjetHonoraires($projetId);

    $s = $db->prepare("SELECT * FROM CDS_projets_honoraires WHERE id = ?");
    $s->execute([$id]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

function doRefreshProjet() {
    $body = getBody();
    $projetId = $body['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');

    refreshProjetHonoraires($projetId);

    $db = getDB();
    $s = $db->prepare("SELECT honoraires_prevus, honoraires_engages, honoraires_factures, honoraires_encaisses, alerte_budget FROM CDS_projets WHERE id = ?");
    $s->execute([$projetId]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

function getValeurAcquise() {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');

    $db = getDB();

    // Get phases with their progression data
    $s = $db->prepare("SELECT mission_phase, mission_label, montant_prevu, montant_facture, montant_encaisse, progression_prevue, progression_reelle, ordre FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
    $s->execute([$projetId]);
    $phases = $s->fetchAll(\PDO::FETCH_ASSOC);

    $totalPrevu = 0;
    $totalValeurPlanifiee = 0;  // PV - Planned Value
    $totalValeurAcquise = 0;    // EV - Earned Value
    $totalCoutReel = 0;         // AC - Actual Cost

    foreach ($phases as &$p) {
        $prevu = (float)$p['montant_prevu'];
        $totalPrevu += $prevu;
        $totalValeurPlanifiee += $prevu * (int)$p['progression_prevue'] / 100;
        $totalValeurAcquise += $prevu * (int)$p['progression_reelle'] / 100;
        $totalCoutReel += (float)$p['montant_facture'];

        $p['valeur_planifiee'] = round($prevu * (int)$p['progression_prevue'] / 100, 2);
        $p['valeur_acquise'] = round($prevu * (int)$p['progression_reelle'] / 100, 2);
        $p['cout_reel'] = (float)$p['montant_facture'];
    }
    unset($p);

    // EVM indicators
    $sv = $totalValeurAcquise - $totalValeurPlanifiee;  // Schedule Variance
    $cv = $totalValeurAcquise - $totalCoutReel;          // Cost Variance
    $spi = $totalValeurPlanifiee > 0 ? round($totalValeurAcquise / $totalValeurPlanifiee, 3) : 0;  // Schedule Performance Index
    $cpi = $totalCoutReel > 0 ? round($totalValeurAcquise / $totalCoutReel, 3) : 0;  // Cost Performance Index
    $eac = $cpi > 0 ? round($totalPrevu / $cpi, 2) : $totalPrevu;  // Estimate At Completion

    jsonOk([
        'phases' => $phases,
        'totaux' => [
            'budget' => $totalPrevu,
            'valeur_planifiee' => round($totalValeurPlanifiee, 2),
            'valeur_acquise' => round($totalValeurAcquise, 2),
            'cout_reel' => round($totalCoutReel, 2),
        ],
        'indicateurs' => [
            'sv' => round($sv, 2),
            'cv' => round($cv, 2),
            'spi' => $spi,
            'cpi' => $cpi,
            'eac' => $eac,
        ],
    ]);
}

function getDashboardHonoraires() {
    $db = getDB();

    // All active projects with honoraires tracking
    $stmt = $db->query("SELECT id, code, nom, honoraires_prevus, honoraires_engages, honoraires_factures, honoraires_encaisses, alerte_budget FROM CDS_projets WHERE statut IN ('En cours','Actif') AND honoraires_prevus > 0 ORDER BY alerte_budget DESC, honoraires_prevus DESC");
    $projets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    $totalPrevu = 0; $totalEngage = 0; $totalFacture = 0; $totalEncaisse = 0;
    $alertCounts = ['green' => 0, 'yellow' => 0, 'orange' => 0, 'red' => 0];

    foreach ($projets as $p) {
        $totalPrevu += (float)$p['honoraires_prevus'];
        $totalEngage += (float)$p['honoraires_engages'];
        $totalFacture += (float)$p['honoraires_factures'];
        $totalEncaisse += (float)$p['honoraires_encaisses'];
        $level = $p['alerte_budget'] ?? 'green';
        if (isset($alertCounts[$level])) $alertCounts[$level]++;
    }

    jsonOk([
        'projets' => $projets,
        'totaux' => [
            'prevu' => $totalPrevu,
            'engage' => $totalEngage,
            'facture' => $totalFacture,
            'encaisse' => $totalEncaisse,
        ],
        'alertes' => $alertCounts,
    ]);
}
