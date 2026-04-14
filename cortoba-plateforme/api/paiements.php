<?php
// ============================================================
//  CORTOBA ATELIER — API Paiements & Relances
//  Créances, balance âgée, rapprochement, relances, trésorerie
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// ── Runtime migrations ──
function ensurePaiementsSchema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_paiements` (
      `id` varchar(32) NOT NULL,
      `facture_id` varchar(32) DEFAULT NULL,
      `projet_id` varchar(32) DEFAULT NULL,
      `client_id` varchar(32) DEFAULT NULL,
      `mission_phase` varchar(120) DEFAULT NULL,
      `montant` decimal(14,2) NOT NULL,
      `date_paiement` date NOT NULL,
      `mode_paiement` varchar(40) DEFAULT NULL,
      `reference` varchar(120) DEFAULT NULL,
      `stripe_session_id` varchar(200) DEFAULT NULL,
      `stripe_payment_intent` varchar(200) DEFAULT NULL,
      `notes` text,
      `cree_par` varchar(120) DEFAULT NULL,
      `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `facture_id` (`facture_id`),
      KEY `client_id` (`client_id`),
      KEY `projet_id` (`projet_id`),
      KEY `stripe_session` (`stripe_session_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Migration : autoriser facture_id NULL et ajouter mission_phase
    try { $db->exec("ALTER TABLE CA_paiements MODIFY `facture_id` varchar(32) DEFAULT NULL"); } catch (\Throwable $e) {}
    try { $db->exec("ALTER TABLE CA_paiements ADD COLUMN `mission_phase` varchar(120) DEFAULT NULL AFTER `client_id`"); } catch (\Throwable $e) {}

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_relances` (
      `id` int unsigned NOT NULL AUTO_INCREMENT,
      `facture_id` varchar(32) NOT NULL,
      `client_id` varchar(32) DEFAULT NULL,
      `type` enum('auto','manual') NOT NULL DEFAULT 'auto',
      `canal` varchar(20) NOT NULL DEFAULT 'email',
      `niveau` tinyint NOT NULL DEFAULT 1,
      `date_envoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `email_to` varchar(200) DEFAULT NULL,
      `template_used` varchar(80) DEFAULT NULL,
      `statut` varchar(40) DEFAULT 'sent',
      `cree_par` varchar(120) DEFAULT NULL,
      PRIMARY KEY (`id`),
      KEY `facture_id` (`facture_id`),
      KEY `client_id` (`client_id`),
      KEY `date_envoi` (`date_envoi`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Ensure CA_factures has required columns
    $fa = [
        "ADD COLUMN IF NOT EXISTS `montant_paye` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `relance_niveau` tinyint DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `derniere_relance` datetime DEFAULT NULL",
        "ADD COLUMN IF NOT EXISTS `mission_phase` varchar(30) DEFAULT NULL",
    ];
    foreach ($fa as $a) {
        try { $db->exec("ALTER TABLE CA_factures $a"); } catch (\Throwable $e) {}
    }

    // Ensure CA_clients has mf column (needed by receipt queries)
    try {
        $cols = array_column($db->query("SHOW COLUMNS FROM CA_clients")->fetchAll(), 'Field');
        if (!in_array('mf', $cols)) {
            $db->exec("ALTER TABLE CA_clients ADD COLUMN mf VARCHAR(80) DEFAULT NULL AFTER matricule");
        }
    } catch (\Throwable $e) {}

    $done = true;
}

// ── Record payment & update invoice ──
function recordPayment($db, $data, $userName = null) {
    $factureId = $data['facture_id'] ?? '';
    $montant = (float)($data['montant'] ?? 0);
    if ($montant <= 0) return false;

    $projetId = $data['projet_id'] ?? null;
    $clientId = $data['client_id'] ?? null;
    $facture = null;

    if ($factureId) {
        $s = $db->prepare("SELECT id, projet_id, client_id, net_payer, montant_ttc, montant_paye, statut FROM CA_factures WHERE id = ?");
        $s->execute([$factureId]);
        $facture = $s->fetch(\PDO::FETCH_ASSOC);
        if (!$facture) return false;
        $projetId = $projetId ?: $facture['projet_id'];
        $clientId = $clientId ?: $facture['client_id'];
    } else {
        // Paiement non lié à une facture : projet_id obligatoire
        if (!$projetId) return false;
    }

    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_paiements (id, facture_id, projet_id, client_id, mission_phase, montant, date_paiement, mode_paiement, reference, stripe_session_id, stripe_payment_intent, notes, cree_par) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id,
           $factureId ?: null,
           $projetId,
           $clientId,
           $data['mission_phase'] ?? null,
           $montant,
           $data['date_paiement'] ?? date('Y-m-d'),
           $data['mode_paiement'] ?? null,
           $data['reference'] ?? null,
           $data['stripe_session_id'] ?? null,
           $data['stripe_payment_intent'] ?? null,
           $data['notes'] ?? null,
           $userName,
       ]);

    if ($factureId && $facture) {
        // Update facture montant_paye
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_paiements WHERE facture_id = ?");
        $s->execute([$factureId]);
        $totalPaye = (float)$s->fetchColumn();

        $netAPayer = (float)($facture['net_payer'] ?: $facture['montant_ttc']);
        $newStatut = $facture['statut'];
        if ($totalPaye >= $netAPayer) {
            $newStatut = 'Payée';
        } elseif ($totalPaye > 0) {
            $newStatut = 'Partiellement payée';
        }

        $db->prepare("UPDATE CA_factures SET montant_paye = ?, statut = ?, date_paiement = CASE WHEN ? >= ? THEN CURDATE() ELSE date_paiement END WHERE id = ?")
           ->execute([$totalPaye, $newStatut, $totalPaye, $netAPayer, $factureId]);
    }

    // Refresh project honoraires if available
    if ($projetId) {
        require_once __DIR__ . '/honoraires.php';
        ensureHonorairesSchema();
        refreshProjetHonoraires($projetId);
    }

    return $id;
}

// ── Main handler ──
// Ne s'exécute QUE si le script est appelé directement (pas via require_once)
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'paiements.php') {

setCorsHeaders();
ensurePaiementsSchema();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'list':
            requireAuth();
            listPaiements();
            break;
        case 'create':
            $user = requireAuth();
            if ($method !== 'POST') jsonError('POST requis', 405);
            createPaiement($user);
            break;
        case 'delete':
            $user = requireAuth();
            if ($method !== 'DELETE') jsonError('DELETE requis', 405);
            deletePaiement($user);
            break;
        case 'receivables':
            requireAuth();
            getReceivables();
            break;
        case 'aged_balance':
            requireAuth();
            getAgedBalance();
            break;
        case 'cashflow':
            requireAuth();
            getCashflow();
            break;
        case 'relance_send':
            $user = requireAuth();
            if ($method !== 'POST') jsonError('POST requis', 405);
            sendRelance($user);
            break;
        case 'relance_log':
            requireAuth();
            getRelanceLog();
            break;
        case 'receipt':
            requireAuth();
            getReceiptData();
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

} // fin du guard basename === 'paiements.php'

// ── Actions ──

function listPaiements() {
    $db = getDB();
    $where = "1=1";
    $params = [];

    if (!empty($_GET['facture_id'])) {
        $where .= " AND p.facture_id = ?";
        $params[] = $_GET['facture_id'];
    }
    if (!empty($_GET['projet_id'])) {
        $where .= " AND p.projet_id = ?";
        $params[] = $_GET['projet_id'];
    }
    if (!empty($_GET['client_id'])) {
        $where .= " AND p.client_id = ?";
        $params[] = $_GET['client_id'];
    }

    $stmt = $db->prepare("SELECT p.*, f.numero AS facture_numero, c.display_nom AS client_nom, pr.nom AS projet_nom, pr.code AS projet_code
        FROM CA_paiements p
        LEFT JOIN CA_factures f ON f.id COLLATE utf8mb4_unicode_ci = p.facture_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = p.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_projets pr ON pr.id COLLATE utf8mb4_unicode_ci = p.projet_id COLLATE utf8mb4_unicode_ci
        WHERE $where
        ORDER BY p.date_paiement DESC, p.cree_at DESC");
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function createPaiement($user) {
    $body = getBody();
    if (empty($body['facture_id']) && empty($body['projet_id'])) jsonError('projet_id ou facture_id requis');
    if (empty($body['montant']) || (float)$body['montant'] <= 0) jsonError('montant requis et > 0');

    $db = getDB();
    $id = recordPayment($db, $body, $user['name'] ?? null);
    if (!$id) jsonError('Impossible d\'enregistrer le paiement');

    // Dispatch notification
    try {
        require_once __DIR__ . '/notification_dispatch.php';
        $contextLabel = '';
        if (!empty($body['facture_id'])) {
            $s = $db->prepare("SELECT numero FROM CA_factures WHERE id = ?");
            $s->execute([$body['facture_id']]);
            $numero = $s->fetchColumn();
            $contextLabel = 'facture ' . $numero;
        } else if (!empty($body['projet_id'])) {
            $s = $db->prepare("SELECT COALESCE(code, nom) FROM CA_projets WHERE id = ?");
            $s->execute([$body['projet_id']]);
            $contextLabel = 'projet ' . $s->fetchColumn();
        }
        $admins = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($admins as $adminId) {
            dispatchNotification($db, $adminId, 'payment_received',
                'Paiement reçu',
                'Paiement de ' . number_format((float)$body['montant'], 2, ',', ' ') . ' TND pour ' . $contextLabel,
                'creances', null, $user['name'] ?? null);
        }
    } catch (\Throwable $e) { /* notification non-critique */ }

    $s = $db->prepare("SELECT p.*, f.numero AS facture_numero FROM CA_paiements p LEFT JOIN CA_factures f ON f.id COLLATE utf8mb4_unicode_ci = p.facture_id COLLATE utf8mb4_unicode_ci WHERE p.id = ?");
    $s->execute([$id]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

function deletePaiement($user) {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') jsonError('Accès refusé', 403);

    $db = getDB();
    $s = $db->prepare("SELECT facture_id, projet_id FROM CA_paiements WHERE id = ?");
    $s->execute([$id]);
    $paiement = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$paiement) jsonError('Paiement introuvable', 404);

    $db->prepare("DELETE FROM CA_paiements WHERE id = ?")->execute([$id]);

    // Recalculate facture totals
    $factureId = $paiement['facture_id'];
    $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_paiements WHERE facture_id = ?");
    $s->execute([$factureId]);
    $totalPaye = (float)$s->fetchColumn();

    $s = $db->prepare("SELECT net_payer, montant_ttc FROM CA_factures WHERE id = ?");
    $s->execute([$factureId]);
    $f = $s->fetch(\PDO::FETCH_ASSOC);
    $netAPayer = (float)($f['net_payer'] ?: $f['montant_ttc']);

    $newStatut = 'Impayée';
    if ($totalPaye >= $netAPayer) $newStatut = 'Payée';
    elseif ($totalPaye > 0) $newStatut = 'Partiellement payée';

    $db->prepare("UPDATE CA_factures SET montant_paye = ?, statut = ? WHERE id = ?")->execute([$totalPaye, $newStatut, $factureId]);

    if ($paiement['projet_id']) {
        require_once __DIR__ . '/honoraires.php';
        ensureHonorairesSchema();
        refreshProjetHonoraires($paiement['projet_id']);
    }

    jsonOk(['deleted' => $id]);
}

function getReceivables() {
    $db = getDB();

    $stmt = $db->query("SELECT
        f.id, f.numero, f.client, f.client_id, f.projet_id,
        COALESCE(f.net_payer, f.montant_ttc, 0) AS montant_du,
        COALESCE(f.montant_paye, 0) AS montant_paye,
        COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) AS reste,
        f.date_echeance, f.statut, f.relance_niveau, f.derniere_relance,
        CASE WHEN f.date_echeance IS NOT NULL AND f.date_echeance < CURDATE() THEN DATEDIFF(CURDATE(), f.date_echeance) ELSE 0 END AS jours_retard,
        c.display_nom AS client_nom, c.email AS client_email,
        p.code AS projet_code, p.nom AS projet_nom
        FROM CA_factures f
        LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = f.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = f.projet_id COLLATE utf8mb4_unicode_ci
        WHERE f.statut IN ('Impayée', 'Partiellement payée', 'Émise')
        ORDER BY jours_retard DESC, f.date_echeance ASC");

    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    // Compute summary
    $totalCreances = 0; $totalEchues = 0; $nbEchues = 0;
    foreach ($rows as $r) {
        $reste = (float)$r['reste'];
        $totalCreances += $reste;
        if ((int)$r['jours_retard'] > 0) {
            $totalEchues += $reste;
            $nbEchues++;
        }
    }

    jsonOk([
        'factures' => $rows,
        'summary' => [
            'total_creances' => round($totalCreances, 2),
            'total_echues' => round($totalEchues, 2),
            'nb_factures' => count($rows),
            'nb_echues' => $nbEchues,
        ],
    ]);
}

function getAgedBalance() {
    $db = getDB();

    $stmt = $db->query("SELECT
        c.id AS client_id, c.display_nom AS client_nom,
        SUM(CASE WHEN f.date_echeance >= CURDATE() THEN COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) ELSE 0 END) AS non_echu,
        SUM(CASE WHEN DATEDIFF(CURDATE(), f.date_echeance) BETWEEN 1 AND 30 THEN COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) ELSE 0 END) AS tranche_0_30,
        SUM(CASE WHEN DATEDIFF(CURDATE(), f.date_echeance) BETWEEN 31 AND 60 THEN COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) ELSE 0 END) AS tranche_31_60,
        SUM(CASE WHEN DATEDIFF(CURDATE(), f.date_echeance) BETWEEN 61 AND 90 THEN COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) ELSE 0 END) AS tranche_61_90,
        SUM(CASE WHEN DATEDIFF(CURDATE(), f.date_echeance) > 90 THEN COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0) ELSE 0 END) AS tranche_90_plus,
        SUM(COALESCE(f.net_payer, f.montant_ttc, 0) - COALESCE(f.montant_paye, 0)) AS total
        FROM CA_factures f
        JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = f.client_id COLLATE utf8mb4_unicode_ci
        WHERE f.statut IN ('Impayée', 'Partiellement payée', 'Émise')
        GROUP BY c.id, c.display_nom
        ORDER BY total DESC");

    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    // Totals row
    $totals = ['non_echu' => 0, 'tranche_0_30' => 0, 'tranche_31_60' => 0, 'tranche_61_90' => 0, 'tranche_90_plus' => 0, 'total' => 0];
    foreach ($rows as $r) {
        foreach ($totals as $k => &$v) $v += (float)$r[$k];
    }
    unset($v);

    jsonOk(['clients' => $rows, 'totals' => $totals]);
}

function getCashflow() {
    $db = getDB();
    $months = [];
    $now = new \DateTime();

    // Generate 6 months forward
    for ($i = 0; $i < 6; $i++) {
        $d = clone $now;
        $d->modify("+$i months");
        $key = $d->format('Y-m');
        $months[$key] = [
            'mois' => $key,
            'label' => $d->format('M Y'),
            'entrees_prevues' => 0,
            'entrees_reelles' => 0,
            'sorties_prevues' => 0,
            'solde' => 0,
        ];
    }

    // Incoming: from echeancier (planned invoices)
    try {
        $stmt = $db->prepare("SELECT DATE_FORMAT(date_prevue, '%Y-%m') AS mois, SUM(montant_prevu) AS total
            FROM CA_echeancier WHERE statut = 'prevu' AND date_prevue >= ? AND date_prevue < DATE_ADD(?, INTERVAL 6 MONTH)
            GROUP BY mois");
        $stmt->execute([$now->format('Y-m-01'), $now->format('Y-m-01')]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if (isset($months[$r['mois']])) $months[$r['mois']]['entrees_prevues'] += (float)$r['total'];
        }
    } catch (\Throwable $e) {}

    // Incoming: unpaid invoices by due date
    try {
        $stmt = $db->prepare("SELECT DATE_FORMAT(date_echeance, '%Y-%m') AS mois,
            SUM(COALESCE(net_payer, montant_ttc, 0) - COALESCE(montant_paye, 0)) AS total
            FROM CA_factures WHERE statut IN ('Impayée', 'Partiellement payée', 'Émise')
            AND date_echeance >= ? AND date_echeance < DATE_ADD(?, INTERVAL 6 MONTH)
            GROUP BY mois");
        $stmt->execute([$now->format('Y-m-01'), $now->format('Y-m-01')]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if (isset($months[$r['mois']])) $months[$r['mois']]['entrees_prevues'] += (float)$r['total'];
        }
    } catch (\Throwable $e) {}

    // Actual incoming: payments received
    try {
        $stmt = $db->prepare("SELECT DATE_FORMAT(date_paiement, '%Y-%m') AS mois, SUM(montant) AS total
            FROM CA_paiements WHERE date_paiement >= ? AND date_paiement < DATE_ADD(?, INTERVAL 6 MONTH)
            GROUP BY mois");
        $stmt->execute([$now->format('Y-m-01'), $now->format('Y-m-01')]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if (isset($months[$r['mois']])) $months[$r['mois']]['entrees_reelles'] += (float)$r['total'];
        }
    } catch (\Throwable $e) {}

    // Outgoing: recurring expenses (from templates)
    try {
        $stmt = $db->query("SELECT montant, frequence FROM CA_depenses_templates WHERE actif = 1");
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $t) {
            $montant = (float)$t['montant'];
            $freq = $t['frequence'] ?? 'mensuel';
            foreach ($months as $k => &$m) {
                if ($freq === 'mensuel' || $freq === 'monthly') {
                    $m['sorties_prevues'] += $montant;
                } elseif ($freq === 'trimestriel' || $freq === 'quarterly') {
                    $monthNum = (int)substr($k, 5, 2);
                    if ($monthNum % 3 === 0) $m['sorties_prevues'] += $montant;
                }
            }
            unset($m);
        }
    } catch (\Throwable $e) {}

    // Calculate running balance
    foreach ($months as &$m) {
        $m['solde'] = round($m['entrees_prevues'] - $m['sorties_prevues'], 2);
        $m['entrees_prevues'] = round($m['entrees_prevues'], 2);
        $m['entrees_reelles'] = round($m['entrees_reelles'], 2);
        $m['sorties_prevues'] = round($m['sorties_prevues'], 2);
    }
    unset($m);

    jsonOk(array_values($months));
}

function sendRelance($user) {
    $body = getBody();
    $factureId = $body['facture_id'] ?? '';
    if (!$factureId) jsonError('facture_id requis');

    $db = getDB();

    // Get facture + client info
    $s = $db->prepare("SELECT f.*, c.display_nom AS client_nom, c.email AS client_email
        FROM CA_factures f LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = f.client_id COLLATE utf8mb4_unicode_ci WHERE f.id = ?");
    $s->execute([$factureId]);
    $facture = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$facture) jsonError('Facture introuvable', 404);

    $email = $body['email_to'] ?? $facture['client_email'] ?? '';
    if (!$email) jsonError('Pas d\'email client disponible');

    $niveau = (int)($body['niveau'] ?? (($facture['relance_niveau'] ?? 0) + 1));
    if ($niveau > 3) $niveau = 3;

    // Build email content from template
    $templates = [
        1 => "Cher(e) {client_nom},\n\nNous vous rappelons que la facture n° {facture_numero} d'un montant de {montant} TND est arrivée à échéance le {date_echeance}.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nCordialement,\nCORTOBA Atelier d'Architecture",
        2 => "Cher(e) {client_nom},\n\nMalgré notre précédente relance, la facture n° {facture_numero} d'un montant de {montant} TND reste impayée (échéance : {date_echeance}).\n\nNous vous prions de régulariser cette situation dans un délai de 7 jours.\n\nCordialement,\nCORTOBA Atelier d'Architecture",
        3 => "Cher(e) {client_nom},\n\nNous constatons que la facture n° {facture_numero} ({montant} TND, échéance : {date_echeance}) demeure impayée malgré nos relances précédentes.\n\nSans règlement sous 48 heures, nous nous verrons dans l'obligation d'engager les procédures de recouvrement.\n\nCordialement,\nCORTOBA Atelier d'Architecture",
    ];

    // Check for custom templates in settings
    try {
        $s = $db->prepare("SELECT valeur FROM CA_parametres WHERE cle = 'relance_templates'");
        $s->execute();
        $custom = json_decode($s->fetchColumn() ?: '{}', true);
        if (!empty($custom[$niveau])) $templates[$niveau] = $custom[$niveau];
    } catch (\Throwable $e) {}

    $template = $templates[$niveau] ?? $templates[1];
    $montantDu = (float)($facture['net_payer'] ?: $facture['montant_ttc']) - (float)($facture['montant_paye'] ?? 0);

    $message = str_replace(
        ['{client_nom}', '{facture_numero}', '{montant}', '{date_echeance}'],
        [$facture['client_nom'] ?? $facture['client'], $facture['numero'], number_format($montantDu, 2, ',', ' '), $facture['date_echeance'] ?? 'N/A'],
        $template
    );

    // Send email
    $subject = "Relance - Facture n° " . ($facture['numero'] ?? '') . " - CORTOBA Architecture";
    $headers = "From: CORTOBA Architecture <noreply@cortobaarchitecture.com>\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $sent = @mail($email, $subject, $message, $headers);

    // Log relance
    $db->prepare("INSERT INTO CA_relances (facture_id, client_id, type, canal, niveau, email_to, template_used, statut, cree_par) VALUES (?,?,?,?,?,?,?,?,?)")
       ->execute([$factureId, $facture['client_id'], $body['type'] ?? 'manual', 'email', $niveau, $email, 'niveau_' . $niveau, $sent ? 'sent' : 'failed', $user['name'] ?? null]);

    // Update facture relance info
    $db->prepare("UPDATE CA_factures SET relance_niveau = ?, derniere_relance = NOW() WHERE id = ?")
       ->execute([$niveau, $factureId]);

    jsonOk([
        'sent' => $sent,
        'niveau' => $niveau,
        'email_to' => $email,
        'message_preview' => mb_substr($message, 0, 200) . '...',
    ]);
}

function getRelanceLog() {
    $db = getDB();
    $where = "1=1";
    $params = [];

    if (!empty($_GET['facture_id'])) {
        $where .= " AND r.facture_id = ?";
        $params[] = $_GET['facture_id'];
    }
    if (!empty($_GET['client_id'])) {
        $where .= " AND r.client_id = ?";
        $params[] = $_GET['client_id'];
    }

    $stmt = $db->prepare("SELECT r.*, f.numero AS facture_numero, c.display_nom AS client_nom
        FROM CA_relances r
        LEFT JOIN CA_factures f ON f.id COLLATE utf8mb4_unicode_ci = r.facture_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = r.client_id COLLATE utf8mb4_unicode_ci
        WHERE $where
        ORDER BY r.date_envoi DESC
        LIMIT 200");
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ── Receipt data for PDF generation ──
function getReceiptData() {
    $db = getDB();
    $paiementId = $_GET['id'] ?? '';
    if (!$paiementId) jsonError('id requis');

    $stmt = $db->prepare("
        SELECT p.*,
               f.numero AS facture_numero, f.objet AS facture_objet,
               f.montant_ht, f.montant_ttc, f.net_payer, f.montant_paye,
               f.statut AS facture_statut,
               c.display_nom AS client_nom, c.adresse AS client_adresse,
               c.mf AS client_mf, c.email AS client_email, c.tel AS client_tel,
               pr.nom AS projet_nom, pr.code AS projet_code
        FROM CA_paiements p
        LEFT JOIN CA_factures f ON f.id COLLATE utf8mb4_unicode_ci = p.facture_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = p.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CA_projets pr ON pr.id COLLATE utf8mb4_unicode_ci = p.projet_id COLLATE utf8mb4_unicode_ci
        WHERE p.id = ?
    ");
    $stmt->execute([$paiementId]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) jsonError('Paiement introuvable', 404);

    // Get total paid on this invoice (all payments)
    $s2 = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_paiements WHERE facture_id = ?");
    $s2->execute([$row['facture_id']]);
    $row['total_paye_facture'] = (float)$s2->fetchColumn();

    jsonOk($row);
}
