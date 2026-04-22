<?php
// ============================================================
//  CORTOBA ATELIER — API Paiements Clients
//  Enregistrement de paiements (tranches ou totalité) liés
//  à un devis/projet, indépendamment des factures.
//  La facture est générée à la demande, après paiement total.
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// ── Runtime migrations ──
function ensurePaiementsClientsSchema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    // Table principale : paiements clients (liés au devis/projet)
    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_paiements_clients` (
      `id` varchar(32) NOT NULL,
      `devis_id` varchar(32) DEFAULT NULL,
      `projet_id` varchar(32) DEFAULT NULL,
      `client_id` varchar(32) DEFAULT NULL,
      `facture_id` varchar(32) DEFAULT NULL,
      `montant` decimal(14,2) NOT NULL,
      `date_paiement` date NOT NULL,
      `mode_paiement` varchar(40) DEFAULT NULL,
      `reference` varchar(120) DEFAULT NULL,
      `type_paiement` enum('avance','tranche','solde','total') NOT NULL DEFAULT 'tranche',
      `notes` text,
      `recu_genere` tinyint(1) NOT NULL DEFAULT 0,
      `cree_par` varchar(120) DEFAULT NULL,
      `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `devis_id` (`devis_id`),
      KEY `projet_id` (`projet_id`),
      KEY `client_id` (`client_id`),
      KEY `facture_id` (`facture_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Ensure CDS_devis has tracking columns
    $alters = [
        "ADD COLUMN IF NOT EXISTS `montant_paye` decimal(14,2) DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS `paiement_statut` varchar(30) DEFAULT 'non_paye'",
    ];
    foreach ($alters as $a) {
        try { $db->exec("ALTER TABLE CDS_devis $a"); } catch (\Throwable $e) {}
    }

    // Ensure CDS_paiements_clients has mission_phase + nullable devis_id
    try { $db->exec("ALTER TABLE CDS_paiements_clients ADD COLUMN `mission_phase` varchar(150) DEFAULT NULL AFTER `client_id`"); } catch (\Throwable $e) {}
    try { $db->exec("ALTER TABLE CDS_paiements_clients MODIFY `mission_phase` varchar(500) DEFAULT NULL"); } catch (\Throwable $e) {}
    try { $db->exec("ALTER TABLE CDS_paiements_clients MODIFY `devis_id` varchar(32) DEFAULT NULL"); } catch (\Throwable $e) {}

    // Ensure CDS_clients has mf column (needed by receipt queries)
    try {
        $cols = array_column($db->query("SHOW COLUMNS FROM CDS_clients")->fetchAll(), 'Field');
        if (!in_array('mf', $cols)) {
            $db->exec("ALTER TABLE CDS_clients ADD COLUMN mf VARCHAR(80) DEFAULT NULL AFTER matricule");
        }
    } catch (\Throwable $e) {}

    // Backfill idempotent : renseigner pc.client_id pour les anciens paiements
    // qui n'en ont pas, en résolvant via le client_code du projet.
    // (CDS_projets n'a pas de client_id → on passe par client_code → CDS_clients.code)
    try {
        $db->exec("
            UPDATE CDS_paiements_clients pc
            JOIN CDS_projets p
                ON p.id COLLATE utf8mb4_unicode_ci = pc.projet_id COLLATE utf8mb4_unicode_ci
            JOIN CDS_clients c
                ON c.code COLLATE utf8mb4_unicode_ci = p.client_code COLLATE utf8mb4_unicode_ci
            SET pc.client_id = c.id
            WHERE (pc.client_id IS NULL OR pc.client_id = '')
              AND p.client_code IS NOT NULL
              AND p.client_code <> ''
        ");
    } catch (\Throwable $e) {}

    // Backfill supplémentaire via le devis lié (quand le devis a déjà un client_id)
    try {
        $db->exec("
            UPDATE CDS_paiements_clients pc
            JOIN CDS_devis d
                ON d.id COLLATE utf8mb4_unicode_ci = pc.devis_id COLLATE utf8mb4_unicode_ci
            SET pc.client_id = d.client_id
            WHERE (pc.client_id IS NULL OR pc.client_id = '')
              AND d.client_id IS NOT NULL
              AND d.client_id <> ''
        ");
    } catch (\Throwable $e) {}

    $done = true;
}

// ── Main handler ──
// Ne s'exécute QUE si le script est appelé directement (pas via require_once d'un autre fichier).
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'paiements_clients.php') {

setCorsHeaders();
ensurePaiementsClientsSchema();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'list':
            requireAuth();
            listPaiementsClients();
            break;
        case 'by_devis':
            requireAuth();
            getPaiementsByDevis();
            break;
        case 'by_projet':
            requireAuth();
            getPaiementsByProjet();
            break;
        case 'create':
            $user = requireAuth();
            if ($method !== 'POST') jsonError('POST requis', 405);
            createPaiementClient($user);
            break;
        case 'update':
            $user = requireAuth();
            if ($method !== 'PUT' && $method !== 'POST') jsonError('PUT/POST requis', 405);
            updatePaiementClient($user);
            break;
        case 'delete':
            $user = requireAuth();
            if ($method !== 'DELETE') jsonError('DELETE requis', 405);
            deletePaiementClient($user);
            break;
        case 'generer_facture':
            $user = requireAuth();
            if ($method !== 'POST') jsonError('POST requis', 405);
            genererFactureFromPaiements($user);
            break;
        case 'summary':
            requireAuth();
            getPaiementsSummary();
            break;
        case 'receipt':
            requireAuth();
            getRecuPaiementClient();
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

} // fin du guard basename === 'paiements_clients.php'

// ═══════════════════════════════════════════════════════════════
//  LIST
// ═══════════════════════════════════════════════════════════════

function listPaiementsClients() {
    $db = getDB();
    $where = "1=1";
    $params = [];

    if (!empty($_GET['client_id'])) {
        $where .= " AND pc.client_id = ?";
        $params[] = $_GET['client_id'];
    }
    if (!empty($_GET['statut'])) {
        // Filter devis by paiement_statut
    }

    // NB : CDS_projets n'a pas de colonne client_id, uniquement client (nom) et client_code.
    // On fait donc un double fallback pour résoudre le client :
    //   1) pc.client_id → CDS_clients.id (cas standard)
    //   2) p.client_code → CDS_clients.code (fallback)
    //   3) p.client (nom brut du projet)
    $stmt = $db->prepare("
        SELECT pc.*,
            d.numero AS devis_numero, d.objet AS devis_objet, d.montant_ttc AS devis_montant,
            d.montant_paye AS devis_total_paye, d.paiement_statut,
            COALESCE(NULLIF(c.display_nom, ''), NULLIF(c2.display_nom, ''), p.client) AS client_nom,
            COALESCE(c.email, c2.email) AS client_email,
            p.nom AS projet_nom, p.code AS projet_code,
            f.numero AS facture_numero
        FROM CDS_paiements_clients pc
        LEFT JOIN CDS_devis d ON d.id COLLATE utf8mb4_unicode_ci = pc.devis_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_clients c ON c.id COLLATE utf8mb4_unicode_ci = pc.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = pc.projet_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_clients c2 ON c2.code COLLATE utf8mb4_unicode_ci = p.client_code COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_factures f ON f.id COLLATE utf8mb4_unicode_ci = pc.facture_id COLLATE utf8mb4_unicode_ci
        WHERE $where
        ORDER BY pc.date_paiement DESC, pc.cree_at DESC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    jsonOk($rows);
}

function getPaiementsByDevis() {
    $devisId = $_GET['devis_id'] ?? '';
    if (!$devisId) jsonError('devis_id requis');

    $db = getDB();

    // Devis info
    $s = $db->prepare("SELECT d.*, c.display_nom AS client_nom, c.email AS client_email, p.nom AS projet_nom
        FROM CDS_devis d
        LEFT JOIN CDS_clients c ON c.id COLLATE utf8mb4_unicode_ci = d.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id COLLATE utf8mb4_unicode_ci
        WHERE d.id = ?");
    $s->execute([$devisId]);
    $devis = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$devis) jsonError('Devis introuvable', 404);

    // Paiements
    $s = $db->prepare("SELECT * FROM CDS_paiements_clients WHERE devis_id = ? ORDER BY date_paiement ASC");
    $s->execute([$devisId]);
    $paiements = $s->fetchAll(\PDO::FETCH_ASSOC);

    $totalPaye = 0;
    foreach ($paiements as $p) { $totalPaye += (float)$p['montant']; }

    $montantDevis = (float)($devis['montant_ttc'] ?? 0);
    $reste = $montantDevis - $totalPaye;

    jsonOk([
        'devis' => $devis,
        'paiements' => $paiements,
        'total_paye' => round($totalPaye, 2),
        'montant_devis' => $montantDevis,
        'reste' => round(max(0, $reste), 2),
        'est_solde' => $reste <= 0.01,
        'nb_tranches' => count($paiements),
    ]);
}

function getPaiementsByProjet() {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    $missionPhase = $_GET['mission_phase'] ?? '';

    $db = getDB();

    $where = "pc.projet_id = ?";
    $params = [$projetId];
    if ($missionPhase !== '') {
        $where .= " AND pc.mission_phase = ?";
        $params[] = $missionPhase;
    }

    $s = $db->prepare("SELECT pc.*, d.numero AS devis_numero, d.objet AS devis_objet
        FROM CDS_paiements_clients pc
        LEFT JOIN CDS_devis d ON d.id COLLATE utf8mb4_unicode_ci = pc.devis_id COLLATE utf8mb4_unicode_ci
        WHERE $where
        ORDER BY pc.date_paiement DESC");
    $s->execute($params);
    $paiements = $s->fetchAll(\PDO::FETCH_ASSOC);

    // Total payé pour le projet (toutes missions)
    $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE projet_id = ?");
    $s->execute([$projetId]);
    $totalPayeProjet = (float)$s->fetchColumn();

    // Total payé pour la mission spécifique
    $totalPayeMission = null;
    if ($missionPhase !== '') {
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE projet_id = ? AND mission_phase = ?");
        $s->execute([$projetId, $missionPhase]);
        $totalPayeMission = (float)$s->fetchColumn();
    }

    // Total devis validés du projet (référence pour reste à payer)
    $s = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0), COUNT(*) FROM CDS_devis WHERE projet_id = ? AND statut IN ('Accepté','Accepte','Validé','Valide','Facturé')");
    $s->execute([$projetId]);
    $row = $s->fetch(\PDO::FETCH_NUM);
    $totalDevisValides = (float)($row[0] ?? 0);
    $nbDevisValides = (int)($row[1] ?? 0);

    // Coûts par mission depuis les honoraires (CDS_projets_honoraires)
    $missionsHonoraires = [];
    try {
        $s = $db->prepare("SELECT mission_phase, mission_label, montant_prevu FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
        $s->execute([$projetId]);
        $phases = $s->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($phases as $ph) {
            $mPhase = $ph['mission_phase'];
            $mLabel = $ph['mission_label'] ?: $mPhase;
            $mPrevu = (float)($ph['montant_prevu'] ?? 0);
            // Total payé pour cette mission spécifiquement
            $sp = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE projet_id = ? AND mission_phase = ?");
            $sp->execute([$projetId, $mLabel]);
            $mPaye = (float)$sp->fetchColumn();
            $missionsHonoraires[] = [
                'phase' => $mPhase,
                'label' => $mLabel,
                'montant_prevu' => round($mPrevu, 2),
                'montant_paye' => round($mPaye, 2),
                'reste' => round(max(0, $mPrevu - $mPaye), 2),
            ];
        }
    } catch (\Throwable $e) { /* table absente */ }

    jsonOk([
        'paiements' => $paiements,
        'total_paye' => round($totalPayeProjet, 2),
        'total_paye_mission' => $totalPayeMission !== null ? round($totalPayeMission, 2) : null,
        'total_devis_valides' => round($totalDevisValides, 2),
        'nb_devis_valides' => $nbDevisValides,
        'reste_projet' => round(max(0, $totalDevisValides - $totalPayeProjet), 2),
        'missions_honoraires' => $missionsHonoraires,
    ]);
}

// ═══════════════════════════════════════════════════════════════
//  CREATE
// ═══════════════════════════════════════════════════════════════

function createPaiementClient($user) {
    $body = getBody();
    $devisId = $body['devis_id'] ?? '';
    $projetIdBody = $body['projet_id'] ?? '';
    $missionPhase = $body['mission_phase'] ?? null;
    $montant = (float)($body['montant'] ?? 0);

    if (!$devisId && !$projetIdBody) jsonError('devis_id ou projet_id requis');
    if ($montant <= 0) jsonError('Montant requis et > 0');

    $db = getDB();

    // ── Mode A : devis_id fourni → flow historique (lié à un devis) ──
    // ── Mode B : projet_id seul → on essaie d'auto-résoudre le devis validé du projet ──
    $devis = null;
    if ($devisId) {
        $s = $db->prepare("SELECT * FROM CDS_devis WHERE id = ?");
        $s->execute([$devisId]);
        $devis = $s->fetch(\PDO::FETCH_ASSOC);
        if (!$devis) jsonError('Devis introuvable', 404);
    } else {
        // Auto-resolve : derniers devis acceptés/validés du projet
        $s = $db->prepare("SELECT * FROM CDS_devis WHERE projet_id = ? AND statut IN ('Accepté','Accepte','Validé','Valide','Facturé') ORDER BY cree_at DESC LIMIT 1");
        $s->execute([$projetIdBody]);
        $devis = $s->fetch(\PDO::FETCH_ASSOC);
        if ($devis) {
            $devisId = $devis['id'];
        }
    }

    $projetId = $devis['projet_id'] ?? $projetIdBody ?? null;
    $clientId = $devis['client_id'] ?? ($body['client_id'] ?? null);

    // Si pas de client_id mais on a un projet → résoudre via projet.
    // NB : CDS_projets n'a PAS de colonne client_id, seulement client_code.
    // On cherche donc CDS_clients.id via le client_code du projet.
    if (!$clientId && $projetId) {
        try {
            $s = $db->prepare("
                SELECT c.id
                FROM CDS_projets p
                LEFT JOIN CDS_clients c
                    ON c.code COLLATE utf8mb4_unicode_ci = p.client_code COLLATE utf8mb4_unicode_ci
                WHERE p.id = ?
                LIMIT 1
            ");
            $s->execute([$projetId]);
            $cid = $s->fetchColumn();
            if ($cid) $clientId = $cid;
        } catch (\Throwable $e) {}
    }

    $montantDevis = $devis ? (float)($devis['montant_ttc'] ?? 0) : 0;

    // Recalculate from actual payments
    $dejaPaye = 0;
    if ($devisId) {
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE devis_id = ?");
        $s->execute([$devisId]);
        $dejaPaye = (float)$s->fetchColumn();
    } elseif ($projetId) {
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE projet_id = ?");
        $s->execute([$projetId]);
        $dejaPaye = (float)$s->fetchColumn();
    }

    // Plafond : si on a un devis, le montant ne doit pas dépasser le reste
    if ($devis && $montantDevis > 0) {
        $resteAvant = $montantDevis - $dejaPaye;
        if ($montant > $resteAvant + 0.01) {
            jsonError('Le montant (' . number_format($montant, 2) . ') dépasse le reste à payer (' . number_format($resteAvant, 2) . ')');
        }
    }

    // Determine type
    $typePaiement = $body['type_paiement'] ?? 'tranche';
    if ($montantDevis > 0) {
        if ($dejaPaye == 0 && $montant >= $montantDevis - 0.01) {
            $typePaiement = 'total';
        } elseif ($dejaPaye == 0) {
            $typePaiement = 'avance';
        } elseif ($dejaPaye + $montant >= $montantDevis - 0.01) {
            $typePaiement = 'solde';
        }
    }

    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CDS_paiements_clients (id, devis_id, projet_id, client_id, mission_phase, montant, date_paiement, mode_paiement, reference, type_paiement, notes, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([
            $id,
            $devisId ?: null,
            $projetId,
            $clientId,
            $missionPhase,
            $montant,
            $body['date_paiement'] ?? date('Y-m-d'),
            $body['mode_paiement'] ?? null,
            $body['reference'] ?? null,
            $typePaiement,
            $body['notes'] ?? null,
            $user['name'] ?? null,
        ]);

    // Update devis totals (uniquement si on est rattaché à un devis)
    $nouveauTotal = $dejaPaye + $montant;
    $statut = 'non_paye';
    if ($montantDevis > 0 && $nouveauTotal >= $montantDevis - 0.01) {
        $statut = 'solde';
    } elseif ($nouveauTotal > 0) {
        $statut = 'partiel';
    }

    if ($devisId) {
        $db->prepare("UPDATE CDS_devis SET montant_paye = ?, paiement_statut = ? WHERE id = ?")
           ->execute([$nouveauTotal, $statut, $devisId]);
    }

    // Notify
    try {
        require_once __DIR__ . '/notification_dispatch.php';
        $clientNom = $devis['client'] ?? '';
        $devisNum = $devis['numero'] ?? '';
        $admins = $db->query("SELECT id FROM CDS_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($admins as $adminId) {
            $msg = 'Paiement de ' . number_format($montant, 2, ',', ' ') . ' TND reçu pour devis ' . $devisNum . ' (' . $clientNom . ')';
            if ($statut === 'solde') $msg .= ' — Devis entièrement payé !';
            dispatchNotification($db, $adminId, 'payment_received', 'Paiement client reçu', $msg, 'paiements-clients', $id, $user['name'] ?? null);
        }
    } catch (\Throwable $e) { /* non-critique */ }

    // Get created payment
    $s = $db->prepare("SELECT * FROM CDS_paiements_clients WHERE id = ?");
    $s->execute([$id]);
    $paiement = $s->fetch(\PDO::FETCH_ASSOC);

    jsonOk([
        'paiement' => $paiement,
        'devis_total_paye' => round($nouveauTotal, 2),
        'devis_reste' => round(max(0, $montantDevis - $nouveauTotal), 2),
        'devis_statut' => $statut,
        'est_solde' => $statut === 'solde',
    ]);
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════════════════

function updatePaiementClient($user) {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') jsonError('Accès refusé', 403);

    $db = getDB();
    $s = $db->prepare("SELECT * FROM CDS_paiements_clients WHERE id = ?");
    $s->execute([$id]);
    $old = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$old) jsonError('Paiement introuvable', 404);

    $body = getBody();
    $montant       = isset($body['montant']) ? (float)$body['montant'] : (float)$old['montant'];
    $datePaiement  = $body['date_paiement'] ?? $old['date_paiement'];
    $modePaiement  = $body['mode_paiement'] ?? $old['mode_paiement'];
    $reference     = $body['reference'] ?? $old['reference'];
    $typePaiement  = $body['type_paiement'] ?? $old['type_paiement'];
    $notes         = $body['notes'] ?? $old['notes'];

    if ($montant <= 0) jsonError('Montant invalide');

    $db->prepare("UPDATE CDS_paiements_clients SET montant=?, date_paiement=?, mode_paiement=?, reference=?, type_paiement=?, notes=? WHERE id=?")
       ->execute([$montant, $datePaiement, $modePaiement, $reference, $typePaiement, $notes, $id]);

    // Recalculate devis totals
    $devisId = $old['devis_id'];
    if ($devisId) {
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE devis_id = ?");
        $s->execute([$devisId]);
        $totalPaye = (float)$s->fetchColumn();

        $s = $db->prepare("SELECT montant_ttc FROM CDS_devis WHERE id = ?");
        $s->execute([$devisId]);
        $montantDevis = (float)$s->fetchColumn();

        $statut = 'non_paye';
        if ($totalPaye >= $montantDevis - 0.01) $statut = 'solde';
        elseif ($totalPaye > 0) $statut = 'partiel';

        $db->prepare("UPDATE CDS_devis SET montant_paye = ?, paiement_statut = ? WHERE id = ?")
           ->execute([$totalPaye, $statut, $devisId]);
    }

    $s = $db->prepare("SELECT * FROM CDS_paiements_clients WHERE id = ?");
    $s->execute([$id]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  DELETE
// ═══════════════════════════════════════════════════════════════

function deletePaiementClient($user) {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') jsonError('Accès refusé', 403);

    $db = getDB();
    $s = $db->prepare("SELECT devis_id, montant FROM CDS_paiements_clients WHERE id = ?");
    $s->execute([$id]);
    $paiement = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$paiement) jsonError('Paiement introuvable', 404);

    $db->prepare("DELETE FROM CDS_paiements_clients WHERE id = ?")->execute([$id]);

    // Recalculate devis total
    $devisId = $paiement['devis_id'];
    if ($devisId) {
        $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE devis_id = ?");
        $s->execute([$devisId]);
        $totalPaye = (float)$s->fetchColumn();

        $s = $db->prepare("SELECT montant_ttc FROM CDS_devis WHERE id = ?");
        $s->execute([$devisId]);
        $montantDevis = (float)$s->fetchColumn();

        $statut = 'non_paye';
        if ($totalPaye >= $montantDevis - 0.01) $statut = 'solde';
        elseif ($totalPaye > 0) $statut = 'partiel';

        $db->prepare("UPDATE CDS_devis SET montant_paye = ?, paiement_statut = ? WHERE id = ?")
           ->execute([$totalPaye, $statut, $devisId]);
    }

    jsonOk(['deleted' => $id]);
}

// ═══════════════════════════════════════════════════════════════
//  GENERER FACTURE (après paiement total)
// ═══════════════════════════════════════════════════════════════

function genererFactureFromPaiements($user) {
    $body = getBody();
    $devisId = $body['devis_id'] ?? '';
    if (!$devisId) jsonError('devis_id requis');

    $db = getDB();

    // Get devis
    $s = $db->prepare("SELECT * FROM CDS_devis WHERE id = ?");
    $s->execute([$devisId]);
    $devis = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$devis) jsonError('Devis introuvable', 404);

    // Verify fully paid
    $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE devis_id = ?");
    $s->execute([$devisId]);
    $totalPaye = (float)$s->fetchColumn();
    $montantDevis = (float)($devis['montant_ttc'] ?? 0);

    $forcePartiel = $body['force_partiel'] ?? false;
    if ($totalPaye < $montantDevis - 0.01 && !$forcePartiel) {
        jsonError('Le devis n\'est pas entièrement payé. Reste : ' . number_format($montantDevis - $totalPaye, 2, ',', ' ') . ' TND. Utilisez force_partiel pour générer quand même.');
    }

    // Create facture
    $factCount = (int)$db->query("SELECT COUNT(*) FROM CDS_factures")->fetchColumn();
    $factNumero = 'FA-' . date('Y') . '-' . str_pad($factCount + 1, 3, '0', STR_PAD_LEFT);
    $factureId = bin2hex(random_bytes(16));

    $montantHT  = (float)($devis['montant_ht'] ?? 0);
    $tva        = (float)($devis['tva'] ?? 0);
    $montantTTC = (float)($devis['montant_ttc'] ?? 0);

    // Client details
    $clientAdresse = ''; $clientMF = '';
    if ($devis['client_id']) {
        $sc = $db->prepare("SELECT adresse, mf, matricule FROM CDS_clients WHERE id = ?");
        $sc->execute([$devis['client_id']]);
        $cli = $sc->fetch(\PDO::FETCH_ASSOC);
        if ($cli) {
            $clientAdresse = $cli['adresse'] ?? '';
            $clientMF = $cli['mf'] ?? ($cli['matricule'] ?? '');
        }
    }

    // Build lignes from devis notes
    $lignes = [];
    $notes = $devis['notes'] ?? '';
    if (preg_match_all('/^- (.+)$/m', $notes, $matches)) {
        $perLine = count($matches[1]) > 0 ? round($montantHT / count($matches[1]), 2) : $montantHT;
        foreach ($matches[1] as $line) {
            $lignes[] = ['description' => trim($line), 'quantite' => 1, 'unite' => 'forfait', 'prix_unitaire' => $perLine, 'montant' => $perLine];
        }
    }
    if (empty($lignes)) {
        $lignes[] = ['description' => $devis['objet'] ?? 'Honoraires', 'quantite' => 1, 'unite' => 'forfait', 'prix_unitaire' => $montantHT, 'montant' => $montantHT];
    }

    $timbre = 1.00;
    $rasTaux = (float)($body['ras_taux'] ?? 10);
    $rasAmt = round($montantHT * $rasTaux / 100, 2);
    $netPayer = $montantTTC + $timbre - $rasAmt;

    // Insert facture — already fully paid
    $db->prepare("
        INSERT INTO CDS_factures (id, numero, client, client_id, projet_id,
            client_adresse, client_mf, objet,
            montant_ht, tva, montant_ttc,
            statut, date_facture, date_emission, date_echeance, date_paiement,
            lignes_json, timbre, ras_taux, ras_amt, net_payer,
            montant_paye, notes, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ")->execute([
        $factureId, $factNumero,
        $devis['client'] ?? '', $devis['client_id'], $devis['projet_id'],
        $clientAdresse, $clientMF, $devis['objet'],
        $montantHT, $tva, $montantTTC,
        'Payée', date('Y-m-d'), date('Y-m-d'), date('Y-m-d'), date('Y-m-d'),
        json_encode($lignes, JSON_UNESCAPED_UNICODE),
        $timbre, $rasTaux, $rasAmt, $netPayer,
        $totalPaye, $devis['notes'] ?? '', $user['name'],
    ]);

    // Link payments to facture
    $db->prepare("UPDATE CDS_paiements_clients SET facture_id = ? WHERE devis_id = ?")->execute([$factureId, $devisId]);

    // Also create CDS_paiements entries for compatibility with existing reports
    $s = $db->prepare("SELECT * FROM CDS_paiements_clients WHERE devis_id = ? ORDER BY date_paiement ASC");
    $s->execute([$devisId]);
    $paiements = $s->fetchAll(\PDO::FETCH_ASSOC);
    foreach ($paiements as $p) {
        $pId = bin2hex(random_bytes(16));
        $db->prepare("INSERT INTO CDS_paiements (id, facture_id, projet_id, client_id, montant, date_paiement, mode_paiement, reference, notes, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?)")
           ->execute([$pId, $factureId, $p['projet_id'], $p['client_id'], $p['montant'], $p['date_paiement'], $p['mode_paiement'], $p['reference'], $p['notes'], $user['name']]);
    }

    // Mark devis as invoiced
    $db->prepare("UPDATE CDS_devis SET statut = 'Facturé' WHERE id = ?")->execute([$devisId]);

    // Refresh honoraires
    if ($devis['projet_id']) {
        try {
            require_once __DIR__ . '/honoraires.php';
            ensureHonorairesSchema();
            refreshProjetHonoraires($devis['projet_id']);
        } catch (\Throwable $e) {}
    }

    // Notify
    try {
        require_once __DIR__ . '/notification_dispatch.php';
        $admins = $db->query("SELECT id FROM CDS_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($admins as $adminId) {
            dispatchNotification($db, $adminId, 'success', 'Facture générée',
                'Facture ' . $factNumero . ' créée pour devis ' . ($devis['numero'] ?? '') . ' (entièrement payé)',
                'facturation', $factureId, $user['name']);
        }
    } catch (\Throwable $e) {}

    $s = $db->prepare("SELECT * FROM CDS_factures WHERE id = ?");
    $s->execute([$factureId]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  SUMMARY (pour KPIs page paiements)
// ═══════════════════════════════════════════════════════════════

function getPaiementsSummary() {
    $db = getDB();

    // Total received this year
    $year = date('Y');
    $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE YEAR(date_paiement) = ?");
    $s->execute([$year]);
    $totalAnnee = (float)$s->fetchColumn();

    // Total received this month
    $monthStart = date('Y-m-01');
    $s = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE date_paiement >= ?");
    $s->execute([$monthStart]);
    $totalMois = (float)$s->fetchColumn();

    // Devis with payments
    $s = $db->query("SELECT COUNT(*) FROM CDS_devis WHERE COALESCE(montant_paye,0) > 0 AND paiement_statut != 'solde'");
    $nbEnCours = (int)$s->fetchColumn();

    // Devis fully paid without invoice
    $s = $db->query("SELECT COUNT(*) FROM CDS_devis WHERE paiement_statut = 'solde' AND statut != 'Facturé'");
    $nbAFacturer = (int)$s->fetchColumn();

    // Total remaining on all active devis
    $s = $db->query("SELECT COALESCE(SUM(montant_ttc - COALESCE(montant_paye,0)),0) FROM CDS_devis WHERE statut IN ('En attente','Accepté') AND paiement_statut != 'solde'");
    $totalReste = (float)$s->fetchColumn();

    // Devis summary for table
    $s = $db->query("
        SELECT d.id, d.numero, d.client, d.client_id, d.projet_id, d.objet,
            d.montant_ttc, COALESCE(d.montant_paye,0) AS montant_paye,
            d.montant_ttc - COALESCE(d.montant_paye,0) AS reste,
            d.paiement_statut, d.statut,
            c.display_nom AS client_nom, p.nom AS projet_nom,
            (SELECT COUNT(*) FROM CDS_paiements_clients pc WHERE pc.devis_id COLLATE utf8mb4_unicode_ci = d.id COLLATE utf8mb4_unicode_ci) AS nb_tranches,
            (SELECT MAX(date_paiement) FROM CDS_paiements_clients pc WHERE pc.devis_id COLLATE utf8mb4_unicode_ci = d.id COLLATE utf8mb4_unicode_ci) AS dernier_paiement
        FROM CDS_devis d
        LEFT JOIN CDS_clients c ON c.id COLLATE utf8mb4_unicode_ci = d.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id COLLATE utf8mb4_unicode_ci
        WHERE d.statut NOT IN ('Rejeté','Expiré')
        ORDER BY
            CASE d.paiement_statut WHEN 'partiel' THEN 1 WHEN 'solde' THEN 2 WHEN 'non_paye' THEN 3 ELSE 4 END,
            d.cree_at DESC
    ");
    $devisList = $s->fetchAll(\PDO::FETCH_ASSOC);

    jsonOk([
        'kpis' => [
            'total_annee' => round($totalAnnee, 2),
            'total_mois' => round($totalMois, 2),
            'nb_en_cours' => $nbEnCours,
            'nb_a_facturer' => $nbAFacturer,
            'total_reste' => round($totalReste, 2),
        ],
        'devis' => $devisList,
    ]);
}

// ═══════════════════════════════════════════════════════════════
//  RECU PAIEMENT CLIENT
// ═══════════════════════════════════════════════════════════════

function getRecuPaiementClient() {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');

    $db = getDB();
    $s = $db->prepare("
        SELECT pc.*,
            d.numero AS devis_numero, d.objet AS devis_objet, d.montant_ttc AS devis_montant,
            c.display_nom AS client_nom, c.adresse AS client_adresse, c.mf AS client_mf,
            p.nom AS projet_nom, p.code AS projet_code
        FROM CDS_paiements_clients pc
        LEFT JOIN CDS_devis d ON d.id COLLATE utf8mb4_unicode_ci = pc.devis_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_clients c ON c.id COLLATE utf8mb4_unicode_ci = pc.client_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = pc.projet_id COLLATE utf8mb4_unicode_ci
        WHERE pc.id = ?
    ");
    $s->execute([$id]);
    $row = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$row) jsonError('Paiement introuvable', 404);

    // Total paid on this devis (ou sur le projet si pas de devis)
    if (!empty($row['devis_id'])) {
        $s2 = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE devis_id = ?");
        $s2->execute([$row['devis_id']]);
        $row['total_paye_devis'] = (float)$s2->fetchColumn();
        $row['reste_devis'] = round((float)($row['devis_montant'] ?? 0) - $row['total_paye_devis'], 2);
    } else if (!empty($row['projet_id'])) {
        $s2 = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CDS_paiements_clients WHERE projet_id = ?");
        $s2->execute([$row['projet_id']]);
        $row['total_paye_devis'] = (float)$s2->fetchColumn();
        // Reste sur la base des devis validés du projet
        $s3 = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CDS_devis WHERE projet_id = ? AND statut IN ('Accepté','Accepte','Validé','Valide','Facturé')");
        $s3->execute([$row['projet_id']]);
        $totalDevisProjet = (float)$s3->fetchColumn();
        $row['devis_montant'] = $totalDevisProjet;
        $row['reste_devis'] = round(max(0, $totalDevisProjet - $row['total_paye_devis']), 2);
    } else {
        $row['total_paye_devis'] = (float)$row['montant'];
        $row['reste_devis'] = 0;
    }

    jsonOk($row);
}
