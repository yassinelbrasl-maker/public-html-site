<?php
// ============================================================
//  CORTOBA ATELIER — API Préférences de Notifications
//  GET  ?action=get              → préférences de l'user connecté
//  POST ?action=save             → sauvegarder les préférences
//  GET  ?action=get_vapid_key    → clé publique VAPID pour push
//  POST ?action=push_subscribe   → enregistrer un abonnement push
//  POST ?action=push_unsubscribe → supprimer un abonnement push
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// Bootstrap idempotent des tables
try {
    $_db0 = getDB();

    // Table préférences : quels canaux activer par type de notification
    $_db0->exec("CREATE TABLE IF NOT EXISTS `CA_notification_prefs` (
        `user_id`       VARCHAR(32)  NOT NULL,
        `notif_type`    VARCHAR(60)  NOT NULL DEFAULT '_default',
        `channel_inapp` TINYINT(1)   NOT NULL DEFAULT 1,
        `channel_email` TINYINT(1)   NOT NULL DEFAULT 1,
        `channel_push`  TINYINT(1)   NOT NULL DEFAULT 1,
        `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
        PRIMARY KEY (`user_id`, `notif_type`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Table abonnements push (Web Push)
    $_db0->exec("CREATE TABLE IF NOT EXISTS `CA_push_subscriptions` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `user_id`    VARCHAR(32)  NOT NULL,
        `endpoint`   TEXT         NOT NULL,
        `p256dh`     TEXT         NOT NULL,
        `auth`       TEXT         NOT NULL,
        `user_agent` VARCHAR(300) DEFAULT NULL,
        `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

} catch (\Throwable $e) { /* silencieux */ }

// ── Constantes VAPID (à générer une seule fois, puis stocker) ──
// Clés VAPID générées pour Cortoba Atelier
define('VAPID_PUBLIC_KEY',  'BL7VxVoD3Kx_xRqLChw-Q8zKr8pYxcFgOvSN5tUqFJx_XmG2kCkRvqMnM5C2dXKlL_nR8GHxfT1qX5aKzNYvYM');
define('VAPID_PRIVATE_KEY', 'wJjP8X9LsBxKvM5qQ7dKzQaF4nMtN8vC2hL6yRxP0Ao');
define('VAPID_SUBJECT',     'mailto:cortobaarchitecture@gmail.com');

// ───────────── Handler HTTP ─────────────
$user   = requireAuth();
$db     = getDB();
$action = $_GET['action'] ?? 'get';

// Types de notifications disponibles
$NOTIF_TYPES = [
    '_default'        => 'Par défaut (tous types)',
    'info'            => 'Informations générales',
    'success'         => 'Succès / confirmations',
    'warning'         => 'Avertissements',
    'error'           => 'Erreurs',
    'conge_pending'   => 'Congé — demande reçue',
    'conge_approved'  => 'Congé — approuvé',
    'conge_refused'   => 'Congé — refusé',
    'holiday_reminder'=> 'Rappel jour férié',
    'chat_message'    => 'Nouveau message chat',
    'chat_mention'    => 'Mention dans le chat',
    'tache_assigned'  => 'Tâche assignée',
    'tache_overdue'   => 'Tâche en retard',
    'tache_completed' => 'Tâche terminée',
    'livrable_overdue'=> 'Livrable en retard',
    'budget_alert'    => 'Alerte budget',
    'echeance_proche' => 'Échéance proche',
    'depense_due'     => 'Dépense récurrente à payer',
    'facture_overdue' => 'Facture impayée',
];

try {
    switch ($action) {

        case 'get': {
            // Retourner les préférences de l'utilisateur + les types disponibles
            $stmt = $db->prepare("SELECT * FROM CA_notification_prefs WHERE user_id = ?");
            $stmt->execute([$user['id']]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Construire un map type → prefs
            $prefs = [];
            foreach ($rows as $r) {
                $prefs[$r['notif_type']] = [
                    'inapp'   => (int)$r['channel_inapp'],
                    'email'   => (int)$r['channel_email'],
                    'push'    => (int)$r['channel_push'],
                    'enabled' => (int)$r['enabled'],
                ];
            }

            // Si pas de préférence par défaut, en créer une
            if (!isset($prefs['_default'])) {
                $prefs['_default'] = ['inapp' => 1, 'email' => 1, 'push' => 1, 'enabled' => 1];
            }

            // Vérifier si l'utilisateur a un abonnement push actif
            $pushStmt = $db->prepare("SELECT COUNT(*) FROM CA_push_subscriptions WHERE user_id = ?");
            $pushStmt->execute([$user['id']]);
            $hasPush = (int)$pushStmt->fetchColumn() > 0;

            // Récupérer l'email de l'utilisateur
            $emailStmt = $db->prepare("SELECT email_pro, email_perso, email FROM cortoba_users WHERE id = ?");
            $emailStmt->execute([$user['id']]);
            $emailRow = $emailStmt->fetch();
            $userEmail = $emailRow['email_pro'] ?? $emailRow['email_perso'] ?? $emailRow['email'] ?? '';

            jsonOk([
                'prefs'       => $prefs,
                'types'       => $NOTIF_TYPES,
                'has_push'    => $hasPush,
                'user_email'  => $userEmail,
            ]);
            break;
        }

        case 'save': {
            $body = getBody();
            $prefs = $body['prefs'] ?? [];
            if (!is_array($prefs)) jsonError('Format invalide');

            $stmt = $db->prepare("REPLACE INTO CA_notification_prefs
                (user_id, notif_type, channel_inapp, channel_email, channel_push, enabled)
                VALUES (?, ?, ?, ?, ?, ?)");

            foreach ($prefs as $type => $channels) {
                if (!isset($NOTIF_TYPES[$type])) continue;
                $stmt->execute([
                    $user['id'],
                    $type,
                    (int)($channels['inapp'] ?? 1),
                    (int)($channels['email'] ?? 1),
                    (int)($channels['push'] ?? 1),
                    (int)($channels['enabled'] ?? 1),
                ]);
            }
            jsonOk(['saved' => count($prefs)]);
            break;
        }

        case 'get_vapid_key': {
            jsonOk(['publicKey' => VAPID_PUBLIC_KEY]);
            break;
        }

        case 'push_subscribe': {
            $body = getBody();
            $endpoint = $body['endpoint'] ?? '';
            $p256dh   = $body['keys']['p256dh'] ?? ($body['p256dh'] ?? '');
            $auth     = $body['keys']['auth'] ?? ($body['auth'] ?? '');
            if (!$endpoint || !$p256dh || !$auth) jsonError('Données d\'abonnement incomplètes');

            // Supprimer les anciens abonnements avec le même endpoint
            $db->prepare("DELETE FROM CA_push_subscriptions WHERE endpoint = ?")
               ->execute([$endpoint]);

            $id = bin2hex(random_bytes(16));
            $db->prepare("INSERT INTO CA_push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
                          VALUES (?, ?, ?, ?, ?, ?)")
               ->execute([$id, $user['id'], $endpoint, $p256dh, $auth, $_SERVER['HTTP_USER_AGENT'] ?? '']);

            jsonOk(['id' => $id]);
            break;
        }

        case 'push_unsubscribe': {
            $body = getBody();
            $endpoint = $body['endpoint'] ?? '';
            if ($endpoint) {
                $db->prepare("DELETE FROM CA_push_subscriptions WHERE user_id = ? AND endpoint = ?")
                   ->execute([$user['id'], $endpoint]);
            } else {
                // Supprimer tous les abonnements de l'utilisateur
                $db->prepare("DELETE FROM CA_push_subscriptions WHERE user_id = ?")
                   ->execute([$user['id']]);
            }
            jsonOk(['ok' => true]);
            break;
        }

        default:
            jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}
