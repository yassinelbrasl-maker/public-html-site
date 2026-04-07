<?php
// ============================================================
//  CORTOBA ATELIER — API Dashboard (Vue d'ensemble)
//  KPIs, activité récente, projets actifs
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$user = requireAuth();

try {
    $action = $_GET['action'] ?? 'all';
    if ($action === 'kpis')     getKpis();
    elseif ($action === 'activity') getActivity();
    elseif ($action === 'all')  getAll();
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

    // ── CA YTD (factures payées cette année) ──
    $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) AS ca_ytd
        FROM CA_factures WHERE statut = 'Payée' AND date_emission >= ?");
    $stmt->execute([$yearStart]);
    $caYtd = (float)$stmt->fetchColumn();

    // CA même période année précédente (pour delta)
    $prevYear = (int)$year - 1;
    $prevYearStart = "$prevYear-01-01";
    $prevYearEnd = $prevYear . '-' . $month . '-' . $now->format('d');
    $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) AS ca_prev
        FROM CA_factures WHERE statut = 'Payée' AND date_emission >= ? AND date_emission <= ?");
    $stmt->execute([$prevYearStart, $prevYearEnd]);
    $caPrev = (float)$stmt->fetchColumn();
    $caDelta = $caPrev > 0 ? round(($caYtd - $caPrev) / $caPrev * 100) : ($caYtd > 0 ? 100 : 0);

    // ── Projets en cours ──
    $stmt = $db->query("SELECT COUNT(*) FROM CA_projets WHERE statut = 'En cours'");
    $projetsEnCours = (int)$stmt->fetchColumn();

    // Détail phases des projets en cours
    $stmt = $db->query("SELECT phase, COUNT(*) AS nb FROM CA_projets WHERE statut = 'En cours' GROUP BY phase ORDER BY nb DESC");
    $phases = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    $phaseDetail = '';
    if ($phases) {
        $top = $phases[0];
        $phaseDetail = 'dont ' . $top['nb'] . ' en ' . $top['phase'];
    }

    // ── Devis en attente ──
    $stmt = $db->query("SELECT COUNT(*) AS nb, COALESCE(SUM(montant_ttc),0) AS total
        FROM CA_devis WHERE statut = 'En attente'");
    $devis = $stmt->fetch(\PDO::FETCH_ASSOC);

    // ── Factures impayées ──
    $stmt = $db->query("SELECT COUNT(*) AS nb, COALESCE(SUM(montant_ttc),0) AS total
        FROM CA_factures WHERE statut IN ('Émise','En retard','Impayée')");
    $facturesImpayees = $stmt->fetch(\PDO::FETCH_ASSOC);

    // Jours de retard max
    $stmt = $db->query("SELECT MIN(date_echeance) AS oldest FROM CA_factures
        WHERE statut IN ('Émise','En retard','Impayée') AND date_echeance < CURDATE()");
    $oldest = $stmt->fetchColumn();
    $joursRetard = 0;
    if ($oldest) {
        $joursRetard = (int)((new \DateTime())->diff(new \DateTime($oldest))->days);
    }

    // ── Dépenses du mois ──
    $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) AS total FROM CA_depenses WHERE date_dep >= ?");
    $stmt->execute([$monthStart]);
    $depensesMois = (float)$stmt->fetchColumn();

    // Dépenses mois précédent (delta)
    $prevMonth = (clone $now)->modify('-1 month');
    $prevMonthStart = $prevMonth->format('Y-m-01');
    $prevMonthEnd = $prevMonth->format('Y-m-t');
    $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_depenses WHERE date_dep >= ? AND date_dep <= ?");
    $stmt->execute([$prevMonthStart, $prevMonthEnd]);
    $depensesPrev = (float)$stmt->fetchColumn();
    $depDelta = $depensesPrev > 0 ? round(($depensesMois - $depensesPrev) / $depensesPrev * 100) : 0;

    // ── Taux occupation (heures saisies / heures dispo ce mois) ──
    $stmt = $db->query("SELECT COUNT(*) FROM cortoba_users WHERE statut = 'Actif'");
    $nbActifs = (int)$stmt->fetchColumn();
    $heuresDispo = $nbActifs * 160; // 160h/mois par défaut

    $stmt = $db->prepare("SELECT COALESCE(SUM(hours_spent),0) FROM CA_timesheets WHERE date_jour >= ?");
    $stmt->execute([$monthStart]);
    $heuresSaisies = (float)$stmt->fetchColumn();
    $tauxOccupation = $heuresDispo > 0 ? round($heuresSaisies / $heuresDispo * 100) : 0;

    // ── CA mensuel pour le graphique ──
    $stmt = $db->prepare("SELECT MONTH(date_emission) AS mois, SUM(montant_ttc) AS total
        FROM CA_factures WHERE statut = 'Payée' AND YEAR(date_emission) = ?
        GROUP BY MONTH(date_emission) ORDER BY mois");
    $stmt->execute([$year]);
    $caMensuel = array_fill(0, 12, 0);
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        $caMensuel[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
    }

    // CA mensuel année précédente
    $stmt = $db->prepare("SELECT MONTH(date_emission) AS mois, SUM(montant_ttc) AS total
        FROM CA_factures WHERE statut = 'Payée' AND YEAR(date_emission) = ?
        GROUP BY MONTH(date_emission) ORDER BY mois");
    $stmt->execute([$prevYear]);
    $caMensuelPrev = array_fill(0, 12, 0);
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        $caMensuelPrev[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
    }

    // ── Projets actifs avec avancement ──
    $stmt = $db->query("SELECT id, nom, phase, statut,
        (SELECT COUNT(*) FROM CA_taches WHERE projet_id = p.id) AS total_taches,
        (SELECT COUNT(*) FROM CA_taches WHERE projet_id = p.id AND statut = 'Terminée') AS taches_terminees
        FROM CA_projets p WHERE statut = 'En cours' ORDER BY cree_at DESC LIMIT 6");
    $projetsActifs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    foreach ($projetsActifs as &$p) {
        $p['avancement'] = $p['total_taches'] > 0
            ? round($p['taches_terminees'] / $p['total_taches'] * 100)
            : 0;
    }

    // ── Activité récente (journal + événements système) ──
    $activity = [];

    // Journal récent
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

    // Derniers devis créés/acceptés
    $stmt = $db->query("SELECT numero, client, statut, montant_ttc, cree_at
        FROM CA_devis ORDER BY cree_at DESC LIMIT 3");
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        $color = $row['statut'] === 'Accepté' ? 'green' : ($row['statut'] === 'Refusé' ? 'red' : 'accent');
        $activity[] = [
            'type' => 'devis',
            'text' => 'Devis <strong>' . htmlspecialchars($row['numero']) . '</strong> · ' .
                      htmlspecialchars($row['client']) . ' · ' . $row['statut'],
            'time' => $row['cree_at'],
            'color' => $color
        ];
    }

    // Derniers paiements reçus
    $stmt = $db->query("SELECT numero, client, montant_ttc, date_paiement
        FROM CA_factures WHERE statut = 'Payée' ORDER BY date_paiement DESC LIMIT 3");
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        $activity[] = [
            'type' => 'paiement',
            'text' => 'Paiement reçu — Facture <strong>' . htmlspecialchars($row['numero']) . '</strong> · ' .
                      number_format($row['montant_ttc'], 0, ',', ' ') . ' TND',
            'time' => $row['date_paiement'] ?: date('Y-m-d'),
            'color' => 'green'
        ];
    }

    // Trier par date décroissante et limiter
    usort($activity, function($a, $b) { return strcmp($b['time'], $a['time']); });
    $activity = array_slice($activity, 0, 8);

    // ── Répartition dépenses par catégorie (mois en cours) ──
    $stmt = $db->prepare("SELECT categorie, SUM(montant) AS total
        FROM CA_depenses WHERE date_dep >= ? GROUP BY categorie ORDER BY total DESC LIMIT 5");
    $stmt->execute([$monthStart]);
    $depensesParCat = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    jsonOk([
        'kpis' => [
            'ca_ytd'            => $caYtd,
            'ca_delta'          => $caDelta,
            'projets_en_cours'  => $projetsEnCours,
            'phase_detail'      => $phaseDetail,
            'devis_en_attente'  => (int)$devis['nb'],
            'devis_total'       => (float)$devis['total'],
            'factures_impayees' => (int)$facturesImpayees['nb'],
            'factures_total'    => (float)$facturesImpayees['total'],
            'jours_retard'      => $joursRetard,
            'depenses_mois'     => $depensesMois,
            'dep_delta'         => $depDelta,
            'taux_occupation'   => $tauxOccupation,
            'heures_saisies'    => $heuresSaisies,
            'heures_dispo'      => $heuresDispo,
        ],
        'ca_mensuel'       => $caMensuel,
        'ca_mensuel_prev'  => $caMensuelPrev,
        'projets_actifs'   => $projetsActifs,
        'activity'         => $activity,
        'depenses_par_cat' => $depensesParCat,
        'annee'            => (int)$year,
        'mois_courant'     => (int)$month,
    ]);
}

function getKpis() {
    // Delegate to getAll for now
    getAll();
}

function getActivity() {
    getAll();
}
