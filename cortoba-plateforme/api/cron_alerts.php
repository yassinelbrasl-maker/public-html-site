<?php
// ═══════════════════════════════════════════════════════════════
//  api/cron_alerts.php
//
//  Script planifié (Cron Job cPanel) qui vérifie les alertes critiques :
//   1. Tâches en retard (date_echeance dépassée, non terminées)
//   2. Livrables en retard (tâche avec livrables non validés, échéance passée)
//   3. Dépassement de budget (dépenses réelles > budget projet)
//   4. Échéances proches (tâches/factures dans les 3 prochains jours)
//   5. Factures impayées (date_echeance dépassée, non payées)
//   6. Dépenses récurrentes à payer
//
//  Configuration côté cPanel → Cron Jobs :
//    curl -s "https://cortobaarchitecture.com/cortoba-plateforme/api/cron_alerts.php?key=CORTOBA_CRON_2026"
//  Fréquence : 1 fois par jour (ex : 07:00).
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/notification_dispatch.php';

header('Content-Type: text/plain; charset=utf-8');

define('CRON_ALERTS_SECRET', 'CORTOBA_CRON_2026');
$providedKey = $_GET['key'] ?? '';
if ($providedKey !== CRON_ALERTS_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

$db = getDB();
$counts = ['taches_retard' => 0, 'livrables_retard' => 0, 'budget_depasse' => 0,
           'echeances_proches' => 0, 'factures_impayees' => 0, 'depenses_due' => 0,
           'jours_feries' => 0];

echo "=== Cron alertes critiques — " . date('Y-m-d H:i:s') . " ===\n\n";

// ── Helper : récupérer les admins/gérants ──
function getManagerIds(PDO $db): array {
    $ids = [];
    try {
        $q = $db->query("SELECT id FROM cortoba_users WHERE LOWER(role) IN ('admin','gerant','gérant','manager','directeur') AND statut <> 'Inactif'");
        foreach ($q->fetchAll() as $r) $ids[] = $r['id'];
    } catch (\Throwable $e) {}
    return $ids;
}

// ── Helper : éviter les doublons (vérifier si notif similaire envoyée aujourd'hui) ──
function alreadyNotifiedToday(PDO $db, string $userId, string $type, string $linkId): bool {
    try {
        $stmt = $db->prepare("SELECT COUNT(*) FROM CA_notifications
            WHERE user_id = ? AND type = ? AND link_id = ? AND DATE(cree_at) = CURDATE()");
        $stmt->execute([$userId, $type, $linkId]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (\Throwable $e) { return false; }
}

$managerIds = getManagerIds($db);

try {
    // ══════════════════════════════════════════
    // 1. TÂCHES EN RETARD
    // ══════════════════════════════════════════
    echo "--- Tâches en retard ---\n";
    $stmt = $db->query("
        SELECT t.id, t.titre, t.date_echeance, t.assignee, t.statut, t.projet_id,
               p.nom AS projet_nom
        FROM CA_taches t
        LEFT JOIN CA_projets p ON p.id = t.projet_id
        WHERE t.date_echeance < CURDATE()
          AND t.statut NOT IN ('done','annulée','terminée','Terminée')
          AND t.date_echeance >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ORDER BY t.date_echeance ASC
    ");
    $overdues = $stmt->fetchAll();
    foreach ($overdues as $t) {
        $jours = (int)((time() - strtotime($t['date_echeance'])) / 86400);
        $title = "⚠️ Tâche en retard : " . $t['titre'];
        $msg   = "Retard de {$jours} jour(s)\nProjet : " . ($t['projet_nom'] ?: '—')
               . "\nÉchéance : " . date('d/m/Y', strtotime($t['date_echeance']));

        // Notifier l'assigné
        if ($t['assignee']) {
            if (!alreadyNotifiedToday($db, $t['assignee'], 'tache_overdue', $t['id'])) {
                dispatchNotification($db, $t['assignee'], 'tache_overdue', $title, $msg, 'suivi', $t['id'], 'Système');
                $counts['taches_retard']++;
                echo "  → Notifié assigné ({$t['assignee']}): {$t['titre']}\n";
            }
        }

        // Notifier les managers (si retard > 2 jours)
        if ($jours >= 2) {
            foreach ($managerIds as $mid) {
                if ($mid === $t['assignee']) continue;
                if (!alreadyNotifiedToday($db, $mid, 'tache_overdue', $t['id'])) {
                    dispatchNotification($db, $mid, 'tache_overdue', $title, $msg, 'suivi', $t['id'], 'Système');
                    $counts['taches_retard']++;
                }
            }
        }
    }
    echo "  Total : " . count($overdues) . " tâche(s) en retard\n\n";

    // ══════════════════════════════════════════
    // 2. LIVRABLES EN RETARD
    // ══════════════════════════════════════════
    echo "--- Livrables en retard ---\n";
    $stmt = $db->query("
        SELECT t.id AS tache_id, t.titre, t.date_echeance, t.assignee, t.projet_id,
               p.nom AS projet_nom,
               COUNT(l.id) AS total_livrables,
               SUM(CASE WHEN l.done = 0 THEN 1 ELSE 0 END) AS non_valides
        FROM CA_taches t
        INNER JOIN CA_tache_livrables l ON l.tache_id = t.id
        LEFT JOIN CA_projets p ON p.id = t.projet_id
        WHERE t.date_echeance < CURDATE()
          AND t.statut NOT IN ('done','annulée','terminée','Terminée')
        GROUP BY t.id
        HAVING non_valides > 0
        ORDER BY t.date_echeance ASC
    ");
    $livRetard = $stmt->fetchAll();
    foreach ($livRetard as $lr) {
        $title = "📋 Livrables en retard : " . $lr['titre'];
        $msg = $lr['non_valides'] . "/" . $lr['total_livrables'] . " livrable(s) non validé(s)"
             . "\nProjet : " . ($lr['projet_nom'] ?: '—')
             . "\nÉchéance dépassée : " . date('d/m/Y', strtotime($lr['date_echeance']));

        if ($lr['assignee'] && !alreadyNotifiedToday($db, $lr['assignee'], 'livrable_overdue', $lr['tache_id'])) {
            dispatchNotification($db, $lr['assignee'], 'livrable_overdue', $title, $msg, 'suivi', $lr['tache_id'], 'Système');
            $counts['livrables_retard']++;
            echo "  → {$lr['titre']} ({$lr['non_valides']} non validés)\n";
        }
        foreach ($managerIds as $mid) {
            if ($mid === $lr['assignee']) continue;
            if (!alreadyNotifiedToday($db, $mid, 'livrable_overdue', $lr['tache_id'])) {
                dispatchNotification($db, $mid, 'livrable_overdue', $title, $msg, 'suivi', $lr['tache_id'], 'Système');
                $counts['livrables_retard']++;
            }
        }
    }
    echo "  Total : " . count($livRetard) . " tâche(s) avec livrables en retard\n\n";

    // ══════════════════════════════════════════
    // 3. DÉPASSEMENT DE BUDGET
    // ══════════════════════════════════════════
    echo "--- Dépassement de budget ---\n";
    $stmt = $db->query("
        SELECT p.id, p.nom, p.budget,
               COALESCE(SUM(d.montant_ttc), 0) AS depenses_total
        FROM CA_projets p
        LEFT JOIN CA_depenses d ON d.projet_id = p.id
        WHERE p.budget IS NOT NULL AND p.budget > 0
          AND p.statut NOT IN ('Annulé','Terminé','Archivé')
        GROUP BY p.id
        HAVING depenses_total > p.budget
    ");
    $budgetOver = $stmt->fetchAll();
    foreach ($budgetOver as $b) {
        $pct = round(($b['depenses_total'] / $b['budget']) * 100);
        $depassement = $b['depenses_total'] - $b['budget'];
        $title = "🚨 Budget dépassé : " . $b['nom'];
        $msg = "Budget : " . number_format($b['budget'], 3, ',', ' ') . " TND"
             . "\nDépenses : " . number_format($b['depenses_total'], 3, ',', ' ') . " TND ({$pct}%)"
             . "\nDépassement : " . number_format($depassement, 3, ',', ' ') . " TND";

        foreach ($managerIds as $mid) {
            if (!alreadyNotifiedToday($db, $mid, 'budget_alert', $b['id'])) {
                dispatchNotification($db, $mid, 'budget_alert', $title, $msg, 'projets', $b['id'], 'Système');
                $counts['budget_depasse']++;
                echo "  → {$b['nom']} : {$pct}% du budget\n";
            }
        }
    }

    // Alerte à 80% du budget (warning avant dépassement)
    $stmt80 = $db->query("
        SELECT p.id, p.nom, p.budget,
               COALESCE(SUM(d.montant_ttc), 0) AS depenses_total
        FROM CA_projets p
        LEFT JOIN CA_depenses d ON d.projet_id = p.id
        WHERE p.budget IS NOT NULL AND p.budget > 0
          AND p.statut NOT IN ('Annulé','Terminé','Archivé')
        GROUP BY p.id
        HAVING depenses_total >= (p.budget * 0.8) AND depenses_total <= p.budget
    ");
    foreach ($stmt80->fetchAll() as $b) {
        $pct = round(($b['depenses_total'] / $b['budget']) * 100);
        $title = "⚠️ Budget à {$pct}% : " . $b['nom'];
        $msg = "Attention : le budget du projet approche sa limite."
             . "\nBudget : " . number_format($b['budget'], 3, ',', ' ') . " TND"
             . "\nDépenses actuelles : " . number_format($b['depenses_total'], 3, ',', ' ') . " TND";

        foreach ($managerIds as $mid) {
            if (!alreadyNotifiedToday($db, $mid, 'budget_alert', $b['id'])) {
                dispatchNotification($db, $mid, 'budget_alert', $title, $msg, 'projets', $b['id'], 'Système');
                $counts['budget_depasse']++;
            }
        }
    }
    echo "  Total : " . count($budgetOver) . " projet(s) en dépassement\n\n";

    // ══════════════════════════════════════════
    // 4. ÉCHÉANCES PROCHES (3 jours)
    // ══════════════════════════════════════════
    echo "--- Échéances proches (≤ 3 jours) ---\n";
    $stmt = $db->query("
        SELECT t.id, t.titre, t.date_echeance, t.assignee, t.projet_id,
               p.nom AS projet_nom
        FROM CA_taches t
        LEFT JOIN CA_projets p ON p.id = t.projet_id
        WHERE t.date_echeance BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
          AND t.statut NOT IN ('done','annulée','terminée','Terminée')
        ORDER BY t.date_echeance ASC
    ");
    $upcoming = $stmt->fetchAll();
    foreach ($upcoming as $t) {
        $jours = (int)((strtotime($t['date_echeance']) - time()) / 86400) + 1;
        $label = $jours <= 0 ? "aujourd'hui" : ($jours === 1 ? "demain" : "dans {$jours} jour(s)");
        $title = "📅 Échéance {$label} : " . $t['titre'];
        $msg = "Projet : " . ($t['projet_nom'] ?: '—')
             . "\nDate d'échéance : " . date('d/m/Y', strtotime($t['date_echeance']));

        if ($t['assignee'] && !alreadyNotifiedToday($db, $t['assignee'], 'echeance_proche', $t['id'])) {
            dispatchNotification($db, $t['assignee'], 'echeance_proche', $title, $msg, 'suivi', $t['id'], 'Système');
            $counts['echeances_proches']++;
            echo "  → {$t['titre']} ({$label})\n";
        }
    }
    echo "  Total : " . count($upcoming) . " tâche(s) à échéance proche\n\n";

    // ══════════════════════════════════════════
    // 5. FACTURES IMPAYÉES
    // ══════════════════════════════════════════
    echo "--- Factures impayées ---\n";
    $stmt = $db->query("
        SELECT f.id, f.numero, f.montant_ttc, f.date_echeance, f.statut,
               c.nom AS client_nom, c.raison AS client_raison
        FROM CA_factures f
        LEFT JOIN CA_clients c ON c.id = f.client_id
        WHERE f.date_echeance < CURDATE()
          AND f.statut NOT IN ('payée','Payée','payee','annulée','Annulée')
          AND f.date_echeance >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
        ORDER BY f.date_echeance ASC
    ");
    $unpaid = $stmt->fetchAll();
    foreach ($unpaid as $f) {
        $jours = (int)((time() - strtotime($f['date_echeance'])) / 86400);
        $client = $f['client_raison'] ?: $f['client_nom'] ?: '—';
        $title = "💰 Facture impayée : " . ($f['numero'] ?: $f['id']);
        $msg = "Client : $client"
             . "\nMontant : " . number_format((float)$f['montant_ttc'], 3, ',', ' ') . " TND"
             . "\nÉchéance dépassée de {$jours} jour(s)";

        foreach ($managerIds as $mid) {
            if (!alreadyNotifiedToday($db, $mid, 'facture_overdue', $f['id'])) {
                dispatchNotification($db, $mid, 'facture_overdue', $title, $msg, 'factures', $f['id'], 'Système');
                $counts['factures_impayees']++;
            }
        }
        echo "  → Facture {$f['numero']} — retard {$jours}j\n";
    }
    echo "  Total : " . count($unpaid) . " facture(s) impayée(s)\n\n";

    // ══════════════════════════════════════════
    // 6. DÉPENSES RÉCURRENTES À PAYER
    // ══════════════════════════════════════════
    echo "--- Dépenses récurrentes à payer ---\n";
    $stmt = $db->query("
        SELECT id, label, next_due_date, base_amount_ttc, notify_days_before
        FROM CA_depenses_templates
        WHERE status = 'active'
          AND DATE_SUB(next_due_date, INTERVAL notify_days_before DAY) <= CURDATE()
          AND next_due_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    ");
    $dues = $stmt->fetchAll();
    foreach ($dues as $d) {
        $jours = (int)((strtotime($d['next_due_date']) - time()) / 86400);
        $label = $jours < 0 ? "en retard de " . abs($jours) . " jour(s)" : ($jours === 0 ? "aujourd'hui" : "dans {$jours} jour(s)");
        $title = "🔄 Dépense récurrente : " . $d['label'];
        $msg = "Échéance : " . date('d/m/Y', strtotime($d['next_due_date'])) . " ($label)"
             . "\nMontant : " . number_format((float)$d['base_amount_ttc'], 3, ',', ' ') . " TND";

        foreach ($managerIds as $mid) {
            if (!alreadyNotifiedToday($db, $mid, 'depense_due', $d['id'])) {
                dispatchNotification($db, $mid, 'depense_due', $title, $msg, 'depenses', $d['id'], 'Système');
                $counts['depenses_due']++;
            }
        }
        echo "  → {$d['label']} ($label)\n";
    }
    echo "  Total : " . count($dues) . " dépense(s) due(s)\n\n";

    // ══════════════════════════════════════════
    // 7. JOURS FÉRIÉS — Rappel 48h avant
    // ══════════════════════════════════════════
    echo "--- Jours fériés (rappel 48h) ---\n";

    // Chercher les jours fériés dans les 2 prochains jours (48h)
    $stmtHol = $db->query("
        SELECT id, date, libelle, paye
        FROM CA_jours_feries
        WHERE date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
        ORDER BY date ASC
    ");
    $holidays = $stmtHol->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($holidays)) {
        // Regrouper les jours fériés consécutifs (ex: Aïd 2 jours)
        $groups = [];
        $current = null;
        foreach ($holidays as $h) {
            if ($current && strtotime($h['date']) - strtotime(end($current['items'])['date']) <= 86400) {
                $current['items'][] = $h;
            } else {
                if ($current) $groups[] = $current;
                $current = ['items' => [$h]];
            }
        }
        if ($current) $groups[] = $current;

        // Récupérer tous les membres actifs
        $allUsers = $db->query("SELECT id FROM cortoba_users WHERE statut <> 'Inactif'")->fetchAll(PDO::FETCH_COLUMN);

        foreach ($groups as $g) {
            $nbJours = count($g['items']);
            $first = $g['items'][0];
            $isPaye = (int)$first['paye'];
            $statut = $isPaye ? 'chômé et payé' : 'chômé et non payé';

            // Construire le libellé (regrouper si plusieurs jours)
            $noms = array_map(function($h){ return $h['libelle']; }, $g['items']);
            $dateDebut = date('d/m/Y', strtotime($first['date']));
            $linkId = 'hol_' . $first['date'];

            if ($nbJours > 1) {
                $dateFin = date('d/m/Y', strtotime(end($g['items'])['date']));
                $title = "📅 Jour férié : " . $first['libelle'] . " ({$nbJours} jours)";
                $msg = "Du {$dateDebut} au {$dateFin} — {$nbJours} jour(s) {$statut}"
                     . "\n" . implode(', ', $noms);
            } else {
                $title = "📅 Jour férié : " . $first['libelle'];
                $msg = "Le {$dateDebut} — {$nbJours} jour {$statut}";
            }

            foreach ($allUsers as $uid) {
                if (!alreadyNotifiedToday($db, $uid, 'holiday_reminder', $linkId)) {
                    dispatchNotification($db, $uid, 'holiday_reminder', $title, $msg, 'conges', $linkId, 'Système');
                    $counts['jours_feries']++;
                }
            }
            echo "  → {$first['libelle']} ({$dateDebut}) — {$nbJours}j {$statut}\n";
        }
    }
    echo "  Total : " . count($holidays) . " jour(s) férié(s) dans les 48h\n\n";

} catch (\Throwable $e) {
    echo "ERREUR : " . $e->getMessage() . "\n";
}

// ── Résumé ──
echo "=== Résumé ===\n";
foreach ($counts as $k => $v) echo "  $k : $v notification(s) envoyée(s)\n";

// ── Log ──
$logFile = __DIR__ . '/../../logs/cron_alerts.log';
@mkdir(dirname($logFile), 0755, true);
$logLine = "[" . date('c') . "] " . json_encode($counts) . "\n";
@file_put_contents($logFile, $logLine, FILE_APPEND);

echo "\nOK\n";
