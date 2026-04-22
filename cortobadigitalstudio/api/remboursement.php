<?php
// ============================================================
//  CORTOBA ATELIER — API Remboursement
//  POST ?action=demander     → membre demande un remboursement (notifie admins)
//  POST ?action=statut       → admin change le statut (notifie le demandeur)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/notifications.php';

$user   = requireAuth();
$db     = getDB();
$action = isset($_GET['action']) ? $_GET['action'] : '';
$body   = getBody();

try {
    if ($action === 'demander') {
        // Un membre vient de créer une dépense avec demande de remboursement
        $depenseId   = isset($body['depense_id'])   ? $body['depense_id']   : '';
        $description = isset($body['description'])  ? $body['description']  : '';
        $montant     = isset($body['montant'])       ? $body['montant']      : 0;

        if (!$depenseId) { jsonError('depense_id requis'); }

        // Trouver tous les admins (CDS_accounts) + gérants (cds_users avec is_admin=1)
        $admins = array();

        $stmt = $db->query("SELECT id, name FROM CDS_accounts");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
            $admins[] = $a;
        }

        try {
            $stmt2 = $db->query("SELECT id, CONCAT(prenom, ' ', nom) AS name FROM cds_users WHERE is_admin = 1 AND statut != 'Inactif'");
            foreach ($stmt2->fetchAll(PDO::FETCH_ASSOC) as $a) {
                $admins[] = $a;
            }
        } catch (\Throwable $e) { /* table peut ne pas exister */ }

        $fmtMontant = number_format(floatval($montant), 3, ',', ' ') . ' TND';
        $count = 0;
        foreach ($admins as $admin) {
            // Ne pas notifier soi-même
            if ($admin['id'] === $user['id']) continue;
            notifCreate(
                $db,
                $admin['id'],
                'remboursement',
                'Demande de remboursement — ' . $fmtMontant,
                $user['name'] . ' demande un remboursement pour : ' . $description . ' (' . $fmtMontant . ')',
                'depenses',
                $depenseId,
                $user['name']
            );
            $count++;
        }

        jsonOk(array('notified' => $count));

    } elseif ($action === 'statut') {
        // Admin change le statut d'un remboursement → notifier le demandeur
        $depenseId = isset($body['depense_id']) ? $body['depense_id'] : '';
        $statut    = isset($body['statut'])     ? $body['statut']     : '';
        $creePar   = isset($body['cree_par'])   ? $body['cree_par']   : '';

        if (!$depenseId || !$statut) { jsonError('depense_id et statut requis'); }

        // Chercher le créateur de la dépense
        $stmt = $db->prepare("SELECT id, cree_par, description, montant_ttc FROM CDS_depenses WHERE id = ?");
        $stmt->execute(array($depenseId));
        $dep = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$dep) { jsonError('Dépense introuvable', 404); }

        // Trouver l'user_id du créateur
        $targetUserId = null;
        $targetName   = $dep['cree_par'];

        // Chercher dans cds_users
        try {
            $stmt2 = $db->prepare("SELECT id FROM cds_users WHERE CONCAT(prenom, ' ', nom) = ? LIMIT 1");
            $stmt2->execute(array($targetName));
            $member = $stmt2->fetch(PDO::FETCH_ASSOC);
            if ($member) $targetUserId = $member['id'];
        } catch (\Throwable $e) { }

        // Sinon dans CDS_accounts
        if (!$targetUserId) {
            $stmt3 = $db->prepare("SELECT id FROM CDS_accounts WHERE name = ? LIMIT 1");
            $stmt3->execute(array($targetName));
            $acc = $stmt3->fetch(PDO::FETCH_ASSOC);
            if ($acc) $targetUserId = $acc['id'];
        }

        $labels = array(
            'approuve'  => 'approuvée',
            'refuse'    => 'refusée',
            'rembourse' => 'remboursée',
            'demande'   => 'en attente'
        );
        $label = isset($labels[$statut]) ? $labels[$statut] : $statut;
        $fmtMontant = number_format(floatval($dep['montant_ttc']), 3, ',', ' ') . ' TND';

        if ($targetUserId && $targetUserId !== $user['id']) {
            notifCreate(
                $db,
                $targetUserId,
                'remboursement',
                'Remboursement ' . $label . ' — ' . $fmtMontant,
                $user['name'] . ' a ' . $label . ' votre demande de remboursement pour : ' . ($dep['description'] ?: '—') . ' (' . $fmtMontant . ')',
                'depenses',
                $depenseId,
                $user['name']
            );
        }

        jsonOk(array('ok' => true, 'notified_user' => $targetUserId));

    } else {
        jsonError('Action inconnue. Utiliser: demander, statut', 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}
