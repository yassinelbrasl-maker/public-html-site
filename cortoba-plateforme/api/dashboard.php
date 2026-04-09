<?php
// ============================================================
//  CORTOBA ATELIER — API Dashboard (Vue d'ensemble)
//  KPIs, activité récente, projets actifs
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();

try {
    $action = $_GET['action'] ?? 'all';
    if ($action === 'diag')              getDiag();
    elseif ($action === 'all')           getAll();
    elseif ($action === 'member_access_log') getMemberAccessLog();
    else jsonError('Action inconnue', 400);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

function getAll() {
    $db = getDB();
    $now = new \DateTime();
    $year = $now->format('Y');
    $month = $now->format('m');
    $yearStart = "$year-01-01";
    $monthStart = "$year-$month-01";
    $prevYear = (int)$year - 1;

    // ── Valeurs par défaut ──
    $caYtd = 0; $caDelta = 0;
    $projetsEnCours = 0; $phaseDetail = '';
    $devisNb = 0; $devisTotal = 0;
    $facturesNb = 0; $facturesTot = 0; $joursRetard = 0;
    $depensesMois = 0; $depDelta = 0;
    $nbActifs = 0; $heuresDispo = 0; $heuresSaisies = 0; $tauxOccupation = 0;
    $caMensuel = array_fill(0, 12, 0);
    $caMensuelPrev = array_fill(0, 12, 0);
    $projetsActifs = [];
    $activity = [];
    $depensesParCat = [];

    // Helper : date effective d'une facture
    $dateCol = "COALESCE(date_emission, date_facture, cree_at)";

    // ── CA YTD (factures payées cette année) ──
    try {
        $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CA_factures WHERE statut = 'Payée' AND $dateCol >= ?");
        $stmt->execute([$yearStart]);
        $caYtd = (float)$stmt->fetchColumn();

        $prevYearStart = "$prevYear-01-01";
        $prevYearEnd = $prevYear . '-' . $month . '-' . $now->format('d');
        $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CA_factures WHERE statut = 'Payée' AND $dateCol >= ? AND $dateCol <= ?");
        $stmt->execute([$prevYearStart, $prevYearEnd]);
        $caPrev = (float)$stmt->fetchColumn();
        $caDelta = $caPrev > 0 ? round(($caYtd - $caPrev) / $caPrev * 100) : ($caYtd > 0 ? 100 : 0);
    } catch (\Throwable $e) { /* CA_factures */ }

    // ── Projets en cours (statuts : 'En cours' ou 'Actif') ──
    try {
        $stmt = $db->query("SELECT COUNT(*) FROM CA_projets WHERE statut IN ('En cours','Actif')");
        $projetsEnCours = (int)$stmt->fetchColumn();

        $stmt = $db->query("SELECT phase, COUNT(*) AS nb FROM CA_projets WHERE statut IN ('En cours','Actif') GROUP BY phase ORDER BY nb DESC");
        $phases = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if ($phases) {
            $top = $phases[0];
            $phaseDetail = 'dont ' . $top['nb'] . ' en ' . ($top['phase'] ?: 'APS');
        }
    } catch (\Throwable $e) { /* CA_projets */ }

    // ── Devis en attente ──
    try {
        $stmt = $db->query("SELECT COUNT(*) AS nb, COALESCE(SUM(montant_ttc),SUM(montant_ht),0) AS total FROM CA_devis WHERE statut = 'En attente'");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $devisNb = (int)$row['nb'];
        $devisTotal = (float)$row['total'];
    } catch (\Throwable $e) { /* CA_devis */ }

    // ── Factures impayées (tous les statuts non payés) ──
    try {
        $stmt = $db->query("SELECT COUNT(*) AS nb, COALESCE(SUM(montant_ttc),0) AS total
            FROM CA_factures WHERE statut NOT IN ('Payée','Annulée') AND statut IS NOT NULL");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $facturesNb = (int)$row['nb'];
        $facturesTot = (float)$row['total'];

        $stmt = $db->query("SELECT MIN(date_echeance) AS oldest FROM CA_factures
            WHERE statut NOT IN ('Payée','Annulée') AND date_echeance IS NOT NULL AND date_echeance < CURDATE()");
        $oldest = $stmt->fetchColumn();
        if ($oldest) {
            $joursRetard = (int)((new \DateTime())->diff(new \DateTime($oldest))->days);
        }
    } catch (\Throwable $e) { /* CA_factures */ }

    // ── Dépenses du mois ──
    try {
        $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_depenses WHERE date_dep >= ?");
        $stmt->execute([$monthStart]);
        $depensesMois = (float)$stmt->fetchColumn();

        $prevMonth = (clone $now)->modify('-1 month');
        $prevMonthStart = $prevMonth->format('Y-m-01');
        $prevMonthEnd = $prevMonth->format('Y-m-t');
        $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_depenses WHERE date_dep >= ? AND date_dep <= ?");
        $stmt->execute([$prevMonthStart, $prevMonthEnd]);
        $depensesPrev = (float)$stmt->fetchColumn();
        $depDelta = $depensesPrev > 0 ? round(($depensesMois - $depensesPrev) / $depensesPrev * 100) : 0;
    } catch (\Throwable $e) { /* CA_depenses */ }

    // ── Taux occupation ──
    try {
        $stmt = $db->query("SELECT COUNT(*) FROM cortoba_users WHERE statut = 'Actif'");
        $nbActifs = (int)$stmt->fetchColumn();
        $heuresDispo = $nbActifs * 160;
    } catch (\Throwable $e) {}

    try {
        $stmt = $db->prepare("SELECT COALESCE(SUM(hours_spent),0) FROM CA_timesheets WHERE date_jour >= ?");
        $stmt->execute([$monthStart]);
        $heuresSaisies = (float)$stmt->fetchColumn();
    } catch (\Throwable $e) {}

    $tauxOccupation = $heuresDispo > 0 ? round($heuresSaisies / $heuresDispo * 100) : 0;

    // ── CA mensuel (graphique) ──
    try {
        $stmt = $db->prepare("SELECT MONTH($dateCol) AS mois, SUM(montant_ttc) AS total
            FROM CA_factures WHERE statut = 'Payée' AND YEAR($dateCol) = ?
            GROUP BY MONTH($dateCol) ORDER BY mois");
        $stmt->execute([$year]);
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $caMensuel[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
        }

        $stmt = $db->prepare("SELECT MONTH($dateCol) AS mois, SUM(montant_ttc) AS total
            FROM CA_factures WHERE statut = 'Payée' AND YEAR($dateCol) = ?
            GROUP BY MONTH($dateCol) ORDER BY mois");
        $stmt->execute([$prevYear]);
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $caMensuelPrev[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
        }
    } catch (\Throwable $e) {}

    // ── Projets actifs avec avancement ──
    try {
        $stmt = $db->query("SELECT id, nom, phase, statut,
            (SELECT COUNT(*) FROM CA_taches WHERE projet_id = p.id) AS total_taches,
            (SELECT COUNT(*) FROM CA_taches WHERE projet_id = p.id AND statut IN ('Terminé','Terminée','terminé','terminee')) AS taches_terminees
            FROM CA_projets p WHERE p.statut IN ('En cours','Actif') ORDER BY p.cree_at DESC LIMIT 6");
        $projetsActifs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        try {
            $stmt = $db->query("SELECT id, nom, phase, statut FROM CA_projets WHERE statut IN ('En cours','Actif') ORDER BY cree_at DESC LIMIT 6");
            $projetsActifs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($projetsActifs as &$p) {
                $p['total_taches'] = 0;
                $p['taches_terminees'] = 0;
            }
        } catch (\Throwable $e2) {}
    }
    foreach ($projetsActifs as &$p) {
        $p['avancement'] = isset($p['total_taches']) && $p['total_taches'] > 0
            ? round($p['taches_terminees'] / $p['total_taches'] * 100)
            : 0;
    }

    // ── Activité récente ──

    // Journal récent
    try {
        $stmt = $db->query("SELECT j.description, j.membre, j.date_jour, j.cree_at,
                p.nom AS projet_nom, j.duree
            FROM CA_journal j
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = j.projet_id COLLATE utf8mb4_unicode_ci
            ORDER BY j.cree_at DESC LIMIT 5");
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $activity[] = [
                'type' => 'journal',
                'text' => ($row['membre'] ? '<strong>' . htmlspecialchars($row['membre']) . '</strong> — ' : '') .
                          htmlspecialchars($row['description'] ?: '') .
                          ($row['projet_nom'] ? ' · ' . htmlspecialchars($row['projet_nom']) : ''),
                'time' => $row['cree_at'],
                'color' => 'blue'
            ];
        }
    } catch (\Throwable $e) {}

    // Derniers devis
    try {
        $stmt = $db->query("SELECT numero, client, statut, montant_ttc, cree_at
            FROM CA_devis ORDER BY cree_at DESC LIMIT 3");
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $color = $row['statut'] === 'Accepté' ? 'green' : ($row['statut'] === 'Refusé' ? 'red' : 'accent');
            $activity[] = [
                'type' => 'devis',
                'text' => 'Devis <strong>' . htmlspecialchars($row['numero'] ?: '—') . '</strong> · ' .
                          htmlspecialchars($row['client'] ?: '—') . ' · ' . ($row['statut'] ?: '—'),
                'time' => $row['cree_at'],
                'color' => $color
            ];
        }
    } catch (\Throwable $e) {}

    // Derniers paiements
    try {
        $stmt = $db->query("SELECT numero, client, montant_ttc, COALESCE(date_paiement, date_facture, cree_at) AS dt
            FROM CA_factures WHERE statut = 'Payée' ORDER BY dt DESC LIMIT 3");
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $activity[] = [
                'type' => 'paiement',
                'text' => 'Paiement reçu — Facture <strong>' . htmlspecialchars($row['numero'] ?: '—') . '</strong> · ' .
                          number_format((float)$row['montant_ttc'], 0, ',', ' ') . ' TND',
                'time' => $row['dt'],
                'color' => 'green'
            ];
        }
    } catch (\Throwable $e) {}

    usort($activity, function($a, $b) { return strcmp($b['time'], $a['time']); });
    $activity = array_slice($activity, 0, 8);

    // ── Répartition dépenses par catégorie ──
    try {
        $stmt = $db->prepare("SELECT categorie, SUM(montant) AS total
            FROM CA_depenses WHERE date_dep >= ? GROUP BY categorie ORDER BY total DESC LIMIT 5");
        $stmt->execute([$monthStart]);
        $depensesParCat = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    // ── Soldes projets (total avance reçue, reste à payer) ──
    $totalHonoPrevus = 0; $totalHonoFacture = 0; $totalHonoEncaisse = 0;
    $soldesProjets = [];
    try {
        $stmt = $db->query("SELECT id, code, nom, client, phase,
            COALESCE(honoraires_prevus,0) AS honoraires_prevus,
            COALESCE(honoraires_factures,0) AS honoraires_factures,
            COALESCE(honoraires_encaisses,0) AS honoraires_encaisses
            FROM CA_projets WHERE statut IN ('En cours','Actif') AND COALESCE(honoraires_prevus,0) > 0
            ORDER BY (COALESCE(honoraires_factures,0) - COALESCE(honoraires_encaisses,0)) DESC LIMIT 10");
        $soldesProjets = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($soldesProjets as $sp) {
            $totalHonoPrevus   += (float)$sp['honoraires_prevus'];
            $totalHonoFacture  += (float)$sp['honoraires_factures'];
            $totalHonoEncaisse += (float)$sp['honoraires_encaisses'];
        }
    } catch (\Throwable $e) {}

    // ── Demandes configurateur récentes ──
    $demandesRecentes = 0;
    try {
        $stmt = $db->query("SELECT COUNT(*) FROM CA_demandes WHERE statut = 'nouvelle'");
        $demandesRecentes = (int)$stmt->fetchColumn();
    } catch (\Throwable $e) {}

    jsonOk([
        'kpis' => [
            'ca_ytd'            => $caYtd,
            'ca_delta'          => $caDelta,
            'projets_en_cours'  => $projetsEnCours,
            'phase_detail'      => $phaseDetail,
            'devis_en_attente'  => $devisNb,
            'devis_total'       => $devisTotal,
            'factures_impayees' => $facturesNb,
            'factures_total'    => $facturesTot,
            'jours_retard'      => $joursRetard,
            'depenses_mois'     => $depensesMois,
            'dep_delta'         => $depDelta,
            'taux_occupation'   => $tauxOccupation,
            'heures_saisies'    => $heuresSaisies,
            'heures_dispo'      => $heuresDispo,
            'demandes_nouvelles' => $demandesRecentes,
            'total_hono_prevus'  => $totalHonoPrevus,
            'total_hono_facture' => $totalHonoFacture,
            'total_hono_encaisse' => $totalHonoEncaisse,
            'total_reste_a_payer' => round($totalHonoFacture - $totalHonoEncaisse, 2),
        ],
        'ca_mensuel'       => $caMensuel,
        'ca_mensuel_prev'  => $caMensuelPrev,
        'projets_actifs'   => $projetsActifs,
        'activity'         => $activity,
        'depenses_par_cat' => $depensesParCat,
        'soldes_projets'   => $soldesProjets,
        'annee'            => (int)$year,
        'mois_courant'     => (int)$month,
    ]);
}

// ── Diagnostic : affiche les données brutes pour débug ──
function getDiag() {
    $db = getDB();
    $diag = [];

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total, GROUP_CONCAT(DISTINCT statut) AS statuts FROM CA_projets");
        $diag['projets'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['projets'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total, GROUP_CONCAT(DISTINCT statut) AS statuts FROM CA_devis");
        $diag['devis'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['devis'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total, GROUP_CONCAT(DISTINCT statut) AS statuts FROM CA_factures");
        $diag['factures'] = $stmt->fetch(\PDO::FETCH_ASSOC);
        $stmt = $db->query("SELECT id, statut, date_emission, date_facture, montant_ttc FROM CA_factures LIMIT 3");
        $diag['factures_sample'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['factures'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CA_depenses");
        $diag['depenses'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['depenses'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total, GROUP_CONCAT(DISTINCT statut) AS statuts FROM CA_taches");
        $diag['taches'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['taches'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CA_journal");
        $diag['journal'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['journal'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM cortoba_users WHERE statut = 'Actif'");
        $diag['users_actifs'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['users'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CA_timesheets");
        $diag['timesheets'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['timesheets'] = 'ERR: ' . $e->getMessage(); }

    jsonOk($diag);
}

// ═══════════════════════════════════════════════════════════════
//  JOURNAL D'ACCES MEMBRES
// ═══════════════════════════════════════════════════════════════

function getMemberAccessLog() {
    ensureMemberActivityLogTable();
    $page    = max(1, intval($_GET['page'] ?? 1));
    $userId  = $_GET['user_id'] ?? '';
    $limit   = 40;
    $offset  = ($page - 1) * $limit;

    $db = getDB();

    $where = '';
    $params = [];
    if ($userId) {
        $where = 'WHERE l.user_id = ?';
        $params[] = $userId;
    }

    // Total
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_member_activity_log l $where");
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    // Entries
    $stmt = $db->prepare("
        SELECT l.user_id, l.user_name, l.action, l.details, l.ip_address, l.cree_at
        FROM CA_member_activity_log l
        $where
        ORDER BY l.cree_at DESC
        LIMIT $limit OFFSET $offset
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        if ($r['details']) $r['details'] = json_decode($r['details'], true);
    }

    // User list for filter
    $members = $db->query("
        SELECT DISTINCT l.user_id, l.user_name
        FROM CA_member_activity_log l
        WHERE l.user_name IS NOT NULL
        ORDER BY l.user_name
    ")->fetchAll(\PDO::FETCH_ASSOC);

    jsonOk([
        'entries'     => $rows,
        'total'       => $total,
        'page'        => $page,
        'total_pages' => max(1, ceil($total / $limit)),
        'members'     => $members,
    ]);
}
