<?php
// ============================================================
//  CORTOBA ATELIER — API Dashboard (Vue d'ensemble)
//  KPIs, activité récente, projets actifs
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
// Schémas annexes (migrations idempotentes) — honoraires, paiements, paiements_clients
// ajoutent les colonnes / tables nécessaires aux agrégats du dashboard.
require_once __DIR__ . '/honoraires.php';
require_once __DIR__ . '/paiements.php';
require_once __DIR__ . '/paiements_clients.php';

$user = requireAuth();

// Garantir que les tables / colonnes attendues existent AVANT toute requête.
try { ensureHonorairesSchema();        } catch (\Throwable $e) {}
try { ensurePaiementsSchema();         } catch (\Throwable $e) {}
try { ensurePaiementsClientsSchema();  } catch (\Throwable $e) {}

try {
    $action = $_GET['action'] ?? 'all';
    if ($action === 'diag')                  getDiag();
    elseif ($action === 'all')               getAll();
    elseif ($action === 'member_access_log') getMemberAccessLog();
    else jsonError('Action inconnue', 400);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Vérifie la présence d'une colonne (cache statique). */
function colExists($db, $table, $column) {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return $cache[$key];
    try {
        $stmt = $db->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
        $stmt->execute([$table, $column]);
        $cache[$key] = ((int)$stmt->fetchColumn()) > 0;
    } catch (\Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

/** Vérifie l'existence d'une table. */
function tableExists($db, $table) {
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];
    try {
        $stmt = $db->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?");
        $stmt->execute([$table]);
        $cache[$table] = ((int)$stmt->fetchColumn()) > 0;
    } catch (\Throwable $e) {
        $cache[$table] = false;
    }
    return $cache[$table];
}

// ─────────────────────────────────────────────────────────────
//  VUE D'ENSEMBLE — agrégat principal
// ─────────────────────────────────────────────────────────────

function getAll() {
    $db = getDB();
    $now = new \DateTime();
    $year      = $now->format('Y');
    $month     = $now->format('m');
    $day       = $now->format('d');
    $yearStart = "$year-01-01";
    $monthStart = "$year-$month-01";
    $prevYear   = (int)$year - 1;

    // ── Valeurs par défaut ──
    $caYtd = 0; $caDelta = 0;
    $projetsEnCours = 0; $phaseDetail = '';
    $devisNb = 0; $devisTotal = 0;
    $facturesNb = 0; $facturesTot = 0; $joursRetard = 0;
    $depensesMois = 0; $depDelta = 0;
    $nbActifs = 0; $heuresDispo = 0; $heuresSaisies = 0; $tauxOccupation = 0;
    $caMensuel     = array_fill(0, 12, 0);
    $caMensuelPrev = array_fill(0, 12, 0);
    $projetsActifs = [];
    $activity = [];
    $depensesParCat = [];

    // ── Détection dynamique des colonnes optionnelles ──
    $hasDateEmission    = colExists($db, 'CDS_factures', 'date_emission');
    $hasNetPayer        = colExists($db, 'CDS_factures', 'net_payer');
    $hasMontantPaye     = colExists($db, 'CDS_factures', 'montant_paye');
    $hasDepMontantTtc   = colExists($db, 'CDS_depenses', 'montant_ttc');
    $hasUsersHeuresMois = colExists($db, 'cds_users', 'heures_mois');
    $hasPaimClientsTbl  = tableExists($db, 'CDS_paiements_clients');
    $hasHonoPrevus      = colExists($db, 'CDS_projets', 'honoraires_prevus');
    $hasProgression     = colExists($db, 'CDS_taches', 'progression');

    // Expression de date pour les factures (gère l'absence éventuelle de date_emission)
    $factDateCol = $hasDateEmission
        ? "COALESCE(date_emission, date_facture, cree_at)"
        : "COALESCE(date_facture, cree_at)";

    // Expression du montant dû d'une facture (avec fallbacks si colonnes absentes)
    $factDueExpr  = $hasNetPayer   ? "COALESCE(net_payer, montant_ttc, 0)"   : "COALESCE(montant_ttc, 0)";
    $factPaidExpr = $hasMontantPaye ? "COALESCE(montant_paye, 0)"             : "0";
    $factResteExpr = "($factDueExpr - $factPaidExpr)";

    // Expression du montant d'une dépense (TTC prioritaire)
    $depMontantExpr = $hasDepMontantTtc
        ? "COALESCE(montant_ttc, montant, 0)"
        : "COALESCE(montant, 0)";

    // ── Source de vérité du CA : paiements clients encaissés (table CDS_paiements_clients)
    //    Fallback si vide : factures au statut 'Payée'.
    $useCaPaim = false;
    if ($hasPaimClientsTbl) {
        try {
            $cntP = (int)$db->query("SELECT COUNT(*) FROM CDS_paiements_clients")->fetchColumn();
            $useCaPaim = $cntP > 0;
        } catch (\Throwable $e) { $useCaPaim = false; }
    }

    // ── CA YTD + delta vs année précédente ──
    try {
        if ($useCaPaim) {
            $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients
                WHERE YEAR(date_paiement) = ?");
            $stmt->execute([$year]);
            $caYtd = (float)$stmt->fetchColumn();

            $prevYearEnd = "$prevYear-$month-$day";
            $stmt = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients
                WHERE YEAR(date_paiement) = ? AND date_paiement <= ?");
            $stmt->execute([$prevYear, $prevYearEnd]);
            $caPrev = (float)$stmt->fetchColumn();
        } else {
            $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CDS_factures
                WHERE statut = 'Payée' AND $factDateCol >= ?");
            $stmt->execute([$yearStart]);
            $caYtd = (float)$stmt->fetchColumn();

            $prevYearStart = "$prevYear-01-01";
            $prevYearEnd   = "$prevYear-$month-$day";
            $stmt = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CDS_factures
                WHERE statut = 'Payée' AND $factDateCol >= ? AND $factDateCol <= ?");
            $stmt->execute([$prevYearStart, $prevYearEnd]);
            $caPrev = (float)$stmt->fetchColumn();
        }
        $caDelta = $caPrev > 0
            ? (int)round(($caYtd - $caPrev) / $caPrev * 100)
            : ($caYtd > 0 ? 100 : 0);
    } catch (\Throwable $e) { /* silent */ }

    // ── Projets en cours (statuts 'En cours' ou 'Actif') ──
    try {
        $stmt = $db->query("SELECT COUNT(*) FROM CDS_projets WHERE statut IN ('En cours','Actif')");
        $projetsEnCours = (int)$stmt->fetchColumn();

        $stmt = $db->query("SELECT phase, COUNT(*) AS nb FROM CDS_projets
            WHERE statut IN ('En cours','Actif')
            GROUP BY phase ORDER BY nb DESC");
        $phases = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if ($phases) {
            $top = $phases[0];
            $phaseLabel = trim($top['phase'] ?? '');
            $phaseDetail = 'dont ' . $top['nb'] . ' en ' . ($phaseLabel !== '' ? $phaseLabel : 'APS');
        }
    } catch (\Throwable $e) { /* silent */ }

    // ── Devis en attente ──
    try {
        $stmt = $db->query("SELECT COUNT(*) AS nb,
            COALESCE(SUM(COALESCE(montant_ttc, montant_ht, 0)),0) AS total
            FROM CDS_devis WHERE statut = 'En attente'");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $devisNb    = (int)($row['nb'] ?? 0);
        $devisTotal = (float)($row['total'] ?? 0);
    } catch (\Throwable $e) { /* silent */ }

    // ── Factures impayées (statuts canoniques utilisés par paiements.php) ──
    //    'Impayée', 'Partiellement payée', 'Émise', 'En retard'
    try {
        $stmt = $db->query("SELECT COUNT(*) AS nb,
            COALESCE(SUM($factResteExpr),0) AS total
            FROM CDS_factures
            WHERE statut IN ('Impayée','Partiellement payée','Émise','En retard')");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $facturesNb  = (int)($row['nb'] ?? 0);
        $facturesTot = (float)($row['total'] ?? 0);

        $stmt = $db->query("SELECT MIN(date_echeance) AS oldest FROM CDS_factures
            WHERE statut IN ('Impayée','Partiellement payée','Émise','En retard')
              AND date_echeance IS NOT NULL AND date_echeance < CURDATE()");
        $oldest = $stmt->fetchColumn();
        if ($oldest) {
            $joursRetard = (int)((new \DateTime())->diff(new \DateTime($oldest))->days);
        }
    } catch (\Throwable $e) { /* silent */ }

    // ── Dépenses du mois ──
    try {
        $stmt = $db->prepare("SELECT COALESCE(SUM($depMontantExpr),0) FROM CDS_depenses WHERE date_dep >= ?");
        $stmt->execute([$monthStart]);
        $depensesMois = (float)$stmt->fetchColumn();

        $prevMonth      = (clone $now)->modify('-1 month');
        $prevMonthStart = $prevMonth->format('Y-m-01');
        $prevMonthEnd   = $prevMonth->format('Y-m-t');
        $stmt = $db->prepare("SELECT COALESCE(SUM($depMontantExpr),0) FROM CDS_depenses
            WHERE date_dep >= ? AND date_dep <= ?");
        $stmt->execute([$prevMonthStart, $prevMonthEnd]);
        $depensesPrev = (float)$stmt->fetchColumn();
        $depDelta = $depensesPrev > 0
            ? (int)round(($depensesMois - $depensesPrev) / $depensesPrev * 100)
            : 0;
    } catch (\Throwable $e) { /* silent */ }

    // ── Taux d'occupation (timesheets ÷ heures disponibles de l'équipe active) ──
    try {
        if ($hasUsersHeuresMois) {
            $stmt = $db->query("SELECT COUNT(*) AS nb, COALESCE(SUM(heures_mois),0) AS tot
                FROM cds_users WHERE statut = 'Actif'");
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $nbActifs    = (int)($row['nb'] ?? 0);
            $heuresDispo = (float)($row['tot'] ?? 0);
            if ($heuresDispo <= 0) $heuresDispo = $nbActifs * 160;
        } else {
            $stmt = $db->query("SELECT COUNT(*) FROM cds_users WHERE statut = 'Actif'");
            $nbActifs    = (int)$stmt->fetchColumn();
            $heuresDispo = $nbActifs * 160;
        }
    } catch (\Throwable $e) { /* silent */ }

    try {
        $stmt = $db->prepare("SELECT COALESCE(SUM(hours_spent),0) FROM CDS_timesheets
            WHERE date_jour >= ?");
        $stmt->execute([$monthStart]);
        $heuresSaisies = (float)$stmt->fetchColumn();
    } catch (\Throwable $e) { /* silent */ }

    $tauxOccupation = $heuresDispo > 0
        ? (int)round($heuresSaisies / $heuresDispo * 100)
        : 0;

    // ── CA mensuel (graphique) — même source que le KPI CA YTD ──
    try {
        if ($useCaPaim) {
            $stmt = $db->prepare("SELECT MONTH(date_paiement) AS mois, SUM(montant) AS total
                FROM CDS_paiements_clients WHERE YEAR(date_paiement) = ?
                GROUP BY MONTH(date_paiement) ORDER BY mois");
            $stmt->execute([$year]);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $caMensuel[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
            }
            $stmt = $db->prepare("SELECT MONTH(date_paiement) AS mois, SUM(montant) AS total
                FROM CDS_paiements_clients WHERE YEAR(date_paiement) = ?
                GROUP BY MONTH(date_paiement) ORDER BY mois");
            $stmt->execute([$prevYear]);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $caMensuelPrev[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
            }
        } else {
            $stmt = $db->prepare("SELECT MONTH($factDateCol) AS mois, SUM(montant_ttc) AS total
                FROM CDS_factures WHERE statut = 'Payée' AND YEAR($factDateCol) = ?
                GROUP BY MONTH($factDateCol) ORDER BY mois");
            $stmt->execute([$year]);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $caMensuel[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
            }
            $stmt = $db->prepare("SELECT MONTH($factDateCol) AS mois, SUM(montant_ttc) AS total
                FROM CDS_factures WHERE statut = 'Payée' AND YEAR($factDateCol) = ?
                GROUP BY MONTH($factDateCol) ORDER BY mois");
            $stmt->execute([$prevYear]);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $caMensuelPrev[(int)$row['mois'] - 1] = round((float)$row['total'], 2);
            }
        }
    } catch (\Throwable $e) { /* silent */ }

    // ── Projets actifs (avec avancement tâches + progression moyenne pondérée) ──
    try {
        $progCol = $hasProgression
            ? "(SELECT AVG(progression) FROM CDS_taches WHERE projet_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci)"
            : "NULL";
        $stmt = $db->query("SELECT p.id, p.nom, p.phase, p.statut,
            (SELECT COUNT(*) FROM CDS_taches
              WHERE projet_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
            ) AS total_taches,
            (SELECT COUNT(*) FROM CDS_taches
              WHERE projet_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                AND (statut IN ('Terminé','Terminée','terminé','terminee')"
                . ($hasProgression ? " OR progression >= 100" : "") . ")
            ) AS taches_terminees,
            $progCol AS progression_moy
            FROM CDS_projets p
            WHERE p.statut IN ('En cours','Actif')
            ORDER BY p.cree_at DESC LIMIT 6");
        $projetsActifs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        try {
            $stmt = $db->query("SELECT id, nom, phase, statut FROM CDS_projets
                WHERE statut IN ('En cours','Actif')
                ORDER BY cree_at DESC LIMIT 6");
            $projetsActifs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($projetsActifs as &$p) {
                $p['total_taches']     = 0;
                $p['taches_terminees'] = 0;
                $p['progression_moy']  = null;
            }
        } catch (\Throwable $e2) { /* silent */ }
    }
    foreach ($projetsActifs as &$p) {
        $total = (int)($p['total_taches'] ?? 0);
        $prog  = ($p['progression_moy'] !== null && $p['progression_moy'] !== '')
            ? (float)$p['progression_moy']
            : null;
        if ($total > 0 && $prog !== null) {
            $p['avancement'] = max(0, min(100, (int)round($prog)));
        } elseif ($total > 0) {
            $p['avancement'] = (int)round(($p['taches_terminees'] / $total) * 100);
        } else {
            $p['avancement'] = 0;
        }
    }
    unset($p);

    // ── Activité récente ──

    // Journal : colonnes correctes = commentaire, heures (anciennement description, duree)
    try {
        $stmt = $db->query("SELECT j.commentaire, j.membre, j.date_jour, j.cree_at, j.heures,
                j.progression_avant, j.progression_apres,
                p.nom   AS projet_nom,
                t.titre AS tache_titre
            FROM CDS_journal j
            LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = j.projet_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN CDS_taches  t ON t.id COLLATE utf8mb4_unicode_ci = j.tache_id  COLLATE utf8mb4_unicode_ci
            ORDER BY j.cree_at DESC LIMIT 5");
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $parts = [];
            if (!empty($row['membre']))       $parts[] = '<strong>' . htmlspecialchars($row['membre']) . '</strong>';
            if (!empty($row['tache_titre']))  $parts[] = htmlspecialchars($row['tache_titre']);
            elseif (!empty($row['commentaire'])) {
                $c = $row['commentaire'];
                if (function_exists('mb_strimwidth')) $c = mb_strimwidth($c, 0, 80, '…', 'UTF-8');
                elseif (strlen($c) > 80) $c = substr($c, 0, 77) . '…';
                $parts[] = htmlspecialchars($c);
            }
            if (!empty($row['projet_nom']))   $parts[] = '<em style="color:var(--text-3)">(' . htmlspecialchars($row['projet_nom']) . ')</em>';
            if (!empty($row['heures']))       $parts[] = ((float)$row['heures']) . ' h';
            $activity[] = [
                'type'  => 'journal',
                'text'  => implode(' · ', $parts) ?: 'Saisie journal',
                'time'  => $row['cree_at'],
                'color' => 'blue',
            ];
        }
    } catch (\Throwable $e) { /* silent */ }

    // Derniers devis
    try {
        $stmt = $db->query("SELECT numero, client, statut,
            COALESCE(montant_ttc, montant_ht, 0) AS montant, cree_at
            FROM CDS_devis ORDER BY cree_at DESC LIMIT 3");
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $statut = $row['statut'] ?: '—';
            $color  = $statut === 'Accepté' ? 'green' : ($statut === 'Refusé' ? 'red' : 'accent');
            $activity[] = [
                'type'  => 'devis',
                'text'  => 'Devis <strong>' . htmlspecialchars($row['numero'] ?: '—') . '</strong> · '
                         . htmlspecialchars($row['client'] ?: '—') . ' · ' . htmlspecialchars($statut),
                'time'  => $row['cree_at'],
                'color' => $color,
            ];
        }
    } catch (\Throwable $e) { /* silent */ }

    // Derniers paiements (priorise CDS_paiements_clients)
    try {
        if ($useCaPaim) {
            $stmt = $db->query("SELECT pc.montant, pc.date_paiement AS dt, pc.cree_at,
                    d.numero AS devis_numero, d.client AS devis_client,
                    p.nom    AS projet_nom,   cl.display_nom AS client_nom
                FROM CDS_paiements_clients pc
                LEFT JOIN CDS_devis   d  ON d.id  COLLATE utf8mb4_unicode_ci = pc.devis_id   COLLATE utf8mb4_unicode_ci
                LEFT JOIN CDS_projets p  ON p.id  COLLATE utf8mb4_unicode_ci = pc.projet_id  COLLATE utf8mb4_unicode_ci
                LEFT JOIN CDS_clients cl ON cl.id COLLATE utf8mb4_unicode_ci = pc.client_id  COLLATE utf8mb4_unicode_ci
                ORDER BY COALESCE(pc.cree_at, pc.date_paiement) DESC LIMIT 3");
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $label = $row['devis_numero']
                    ? 'Devis <strong>' . htmlspecialchars($row['devis_numero']) . '</strong>'
                    : ($row['projet_nom']
                        ? 'Projet <strong>' . htmlspecialchars($row['projet_nom']) . '</strong>'
                        : 'Paiement');
                $client = $row['client_nom'] ?: $row['devis_client'];
                $suffix = $client ? ' · ' . htmlspecialchars($client) : '';
                $activity[] = [
                    'type'  => 'paiement',
                    'text'  => 'Paiement reçu — ' . $label . $suffix . ' · '
                             . number_format((float)$row['montant'], 0, ',', ' ') . ' TND',
                    'time'  => $row['cree_at'] ?: $row['dt'],
                    'color' => 'green',
                ];
            }
        } else {
            $stmt = $db->query("SELECT numero, client, montant_ttc,
                COALESCE(date_paiement, date_facture, cree_at) AS dt
                FROM CDS_factures WHERE statut = 'Payée' ORDER BY dt DESC LIMIT 3");
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $activity[] = [
                    'type'  => 'paiement',
                    'text'  => 'Paiement reçu — Facture <strong>' . htmlspecialchars($row['numero'] ?: '—')
                             . '</strong> · ' . number_format((float)$row['montant_ttc'], 0, ',', ' ') . ' TND',
                    'time'  => $row['dt'],
                    'color' => 'green',
                ];
            }
        }
    } catch (\Throwable $e) { /* silent */ }

    // Tri décroissant, top 8
    usort($activity, function($a, $b) {
        return strcmp((string)($b['time'] ?? ''), (string)($a['time'] ?? ''));
    });
    $activity = array_slice($activity, 0, 8);

    // ── Répartition dépenses par catégorie (mois courant) ──
    try {
        $stmt = $db->prepare("SELECT COALESCE(NULLIF(categorie,''),'Autre') AS categorie,
            SUM($depMontantExpr) AS total
            FROM CDS_depenses WHERE date_dep >= ?
            GROUP BY COALESCE(NULLIF(categorie,''),'Autre') ORDER BY total DESC LIMIT 5");
        $stmt->execute([$monthStart]);
        $depensesParCat = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { /* silent */ }

    // ── Soldes projets (honoraires prévus / facturés / encaissés) ──
    $totalHonoPrevus = 0; $totalHonoFacture = 0; $totalHonoEncaisse = 0;
    $soldesProjets = [];
    if ($hasHonoPrevus) {
        try {
            $stmt = $db->query("SELECT id, code, nom, client, phase,
                COALESCE(honoraires_prevus,0)    AS honoraires_prevus,
                COALESCE(honoraires_factures,0)  AS honoraires_factures,
                COALESCE(honoraires_encaisses,0) AS honoraires_encaisses
                FROM CDS_projets
                WHERE statut IN ('En cours','Actif')
                  AND COALESCE(honoraires_prevus,0) > 0
                ORDER BY (COALESCE(honoraires_factures,0) - COALESCE(honoraires_encaisses,0)) DESC
                LIMIT 10");
            $soldesProjets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Totaux sur TOUS les projets en cours (pas seulement le top 10)
            $stmt = $db->query("SELECT
                COALESCE(SUM(honoraires_prevus),0)    AS tp,
                COALESCE(SUM(honoraires_factures),0)  AS tf,
                COALESCE(SUM(honoraires_encaisses),0) AS te
                FROM CDS_projets WHERE statut IN ('En cours','Actif')");
            $tot = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($tot) {
                $totalHonoPrevus   = (float)$tot['tp'];
                $totalHonoFacture  = (float)$tot['tf'];
                $totalHonoEncaisse = (float)$tot['te'];
            }
        } catch (\Throwable $e) { /* silent */ }
    }

    // ── Créances clients (synthèse) ──
    $creances = ['total_creances' => 0, 'total_echues' => 0, 'nb_factures' => 0, 'nb_echues' => 0];
    try {
        $stmt = $db->query("SELECT
            COUNT(*) AS nb,
            SUM(CASE WHEN date_echeance IS NOT NULL AND date_echeance < CURDATE() THEN 1 ELSE 0 END) AS nb_echues,
            COALESCE(SUM($factResteExpr),0) AS total,
            COALESCE(SUM(CASE WHEN date_echeance IS NOT NULL AND date_echeance < CURDATE()
                              THEN $factResteExpr ELSE 0 END),0) AS total_echues
            FROM CDS_factures
            WHERE statut IN ('Impayée','Partiellement payée','Émise','En retard')");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            $creances = [
                'total_creances' => round((float)$row['total'], 2),
                'total_echues'   => round((float)$row['total_echues'], 2),
                'nb_factures'    => (int)$row['nb'],
                'nb_echues'      => (int)$row['nb_echues'],
            ];
        }
    } catch (\Throwable $e) { /* silent */ }

    // ── Alertes budget honoraires (projets dépassant les seuils) ──
    $alertesHono = [];
    if ($hasHonoPrevus) {
        try {
            $stmt = $db->query("SELECT id, code, nom, client,
                COALESCE(honoraires_prevus,0)    AS prevus,
                COALESCE(honoraires_factures,0)  AS factures,
                COALESCE(honoraires_encaisses,0) AS encaisses
                FROM CDS_projets
                WHERE statut IN ('En cours','Actif')
                  AND COALESCE(honoraires_prevus,0) > 0
                ORDER BY (COALESCE(honoraires_factures,0) / NULLIF(honoraires_prevus,0)) DESC
                LIMIT 8");
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $prevus = (float)$r['prevus'];
                $fact   = (float)$r['factures'];
                $enc    = (float)$r['encaisses'];
                $ratio  = $prevus > 0 ? round($fact / $prevus * 100) : 0;
                $level  = null;
                if     ($ratio >= 100) $level = 'red';
                elseif ($ratio >= 90)  $level = 'orange';
                elseif ($ratio >= 80)  $level = 'yellow';
                if ($level) {
                    $alertesHono[] = [
                        'id'        => $r['id'],
                        'code'      => $r['code'],
                        'nom'       => $r['nom'],
                        'client'    => $r['client'],
                        'prevus'    => $prevus,
                        'factures'  => $fact,
                        'encaisses' => $enc,
                        'ratio'     => $ratio,
                        'niveau'    => $level,
                    ];
                }
            }
        } catch (\Throwable $e) { /* silent */ }
    }

    // ── Demandes configurateur non traitées ──
    $demandesRecentes = 0;
    try {
        $stmt = $db->query("SELECT COUNT(*) FROM CDS_demandes WHERE statut = 'nouvelle'");
        $demandesRecentes = (int)$stmt->fetchColumn();
    } catch (\Throwable $e) { /* silent */ }

    jsonOk([
        'kpis' => [
            'ca_ytd'              => round($caYtd, 2),
            'ca_delta'            => $caDelta,
            'projets_en_cours'    => $projetsEnCours,
            'phase_detail'        => $phaseDetail,
            'devis_en_attente'    => $devisNb,
            'devis_total'         => round($devisTotal, 2),
            'factures_impayees'   => $facturesNb,
            'factures_total'      => round($facturesTot, 2),
            'jours_retard'        => $joursRetard,
            'depenses_mois'       => round($depensesMois, 2),
            'dep_delta'           => $depDelta,
            'taux_occupation'     => $tauxOccupation,
            'heures_saisies'      => round($heuresSaisies, 2),
            'heures_dispo'        => round($heuresDispo, 2),
            'demandes_nouvelles'  => $demandesRecentes,
            'total_hono_prevus'   => round($totalHonoPrevus, 2),
            'total_hono_facture'  => round($totalHonoFacture, 2),
            'total_hono_encaisse' => round($totalHonoEncaisse, 2),
            'total_reste_a_payer' => round($totalHonoFacture - $totalHonoEncaisse, 2),
        ],
        'ca_mensuel'       => $caMensuel,
        'ca_mensuel_prev'  => $caMensuelPrev,
        'projets_actifs'   => $projetsActifs,
        'activity'         => $activity,
        'depenses_par_cat' => $depensesParCat,
        'soldes_projets'   => $soldesProjets,
        'creances'         => $creances,
        'alertes_hono'     => $alertesHono,
        'annee'            => (int)$year,
        'mois_courant'     => (int)$month,
        'ca_source'        => $useCaPaim ? 'paiements_clients' : 'factures_payees',
    ]);
}

// ─────────────────────────────────────────────────────────────
//  DIAGNOSTIC — état des tables (utile pour debug)
// ─────────────────────────────────────────────────────────────

function getDiag() {
    $db = getDB();
    $diag = [];

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total,
            GROUP_CONCAT(DISTINCT statut) AS statuts FROM CDS_projets");
        $diag['projets'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['projets'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total,
            GROUP_CONCAT(DISTINCT statut) AS statuts FROM CDS_devis");
        $diag['devis'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['devis'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total,
            GROUP_CONCAT(DISTINCT statut) AS statuts FROM CDS_factures");
        $diag['factures'] = $stmt->fetch(\PDO::FETCH_ASSOC);

        // Détection colonnes facultatives
        $diag['factures_cols'] = [
            'date_emission' => colExists($db, 'CDS_factures', 'date_emission'),
            'net_payer'     => colExists($db, 'CDS_factures', 'net_payer'),
            'montant_paye'  => colExists($db, 'CDS_factures', 'montant_paye'),
        ];

        $colDate = colExists($db, 'CDS_factures', 'date_emission')
            ? 'date_emission, date_facture, date_paiement'
            : 'date_facture, date_paiement';
        $stmt = $db->query("SELECT id, statut, $colDate, montant_ttc FROM CDS_factures LIMIT 3");
        $diag['factures_sample'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['factures'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CDS_depenses");
        $diag['depenses'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['depenses'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total,
            GROUP_CONCAT(DISTINCT statut) AS statuts FROM CDS_taches");
        $diag['taches'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['taches'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CDS_journal");
        $diag['journal'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['journal'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM cds_users WHERE statut = 'Actif'");
        $diag['users_actifs'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['users_actifs'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total FROM CDS_timesheets");
        $diag['timesheets'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['timesheets'] = 'ERR: ' . $e->getMessage(); }

    try {
        $stmt = $db->query("SELECT COUNT(*) AS total,
            COALESCE(SUM(montant),0) AS somme_montant FROM CDS_paiements_clients");
        $diag['paiements_clients'] = $stmt->fetch(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) { $diag['paiements_clients'] = 'ERR: ' . $e->getMessage(); }

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
    $stmt = $db->prepare("SELECT COUNT(*) FROM CDS_member_activity_log l $where");
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    // Entries
    $stmt = $db->prepare("
        SELECT l.user_id, l.user_name, l.action, l.details, l.ip_address, l.cree_at
        FROM CDS_member_activity_log l
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
        FROM CDS_member_activity_log l
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
